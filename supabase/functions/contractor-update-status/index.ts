import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
const appBaseUrl =
  (Deno.env.get("APP_BASE_URL") ?? Deno.env.get("PUBLIC_SITE_URL") ?? Deno.env.get("SITE_URL") ?? "").trim();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const normalizeBearer = (h: string) => {
  const s = (h ?? "").trim();
  if (!s) return "";
  if (s.toLowerCase().startsWith("bearer ")) return s;
  return `Bearer ${s}`;
};

type ContractorStatus = "submitted" | "nda_sent" | "reviewing" | "approved" | "rejected";

type Payload = {
  applicationId?: unknown;
  status?: unknown;
  notify?: unknown;
  forceNotify?: unknown;
  baseUrl?: unknown;
};

serve(async (req: Request) => {
  const correlationId = crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return json({ ok: false, message: "Method not allowed", correlationId }, 405);
    }
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return json({ ok: false, message: "Missing Supabase env", correlationId }, 500);
    }

    const authHeader = normalizeBearer(req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "");
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabaseAuth.auth.getUser();
    const authUser = userData.user;
    if (!authUser?.id) return json({ ok: false, message: "User not authenticated", correlationId }, 401);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const ip = getIp(req);
    const { data: profile } = await supabaseAdmin
      .from("users")
      .select("id, role")
      .eq("id", authUser.id)
      .single();

    const role = String(profile?.role || "");
    if (!role || !["admin", "super_admin"].includes(role)) {
      await insertAuditLog(supabaseAdmin, {
        user_id: authUser.id,
        action: "contractor_update_status_forbidden",
        entity_type: "contractor_application",
        entity_id: null,
        ip_address: ip,
        details: { correlationId },
      });
      return json({ ok: false, message: "Forbidden", correlationId }, 403);
    }

    const payload = (await req.json().catch(() => ({}))) as Payload;
    const applicationId = String(payload?.applicationId ?? "").trim();
    const nextStatus = String(payload?.status ?? "").trim() as ContractorStatus;
    const notify = Boolean(payload?.notify ?? true);
    const forceNotify = Boolean(payload?.forceNotify ?? false);
    const baseUrlInput = String(payload?.baseUrl ?? "").trim();
    const effectiveBaseUrl = baseUrlInput || appBaseUrl;

    if (!applicationId) return json({ ok: false, message: "Missing applicationId", correlationId }, 400);
    if (!isValidStatus(nextStatus)) return json({ ok: false, message: "Invalid status", correlationId }, 400);

    const { data: current } = await supabaseAdmin
      .from("contractor_applications")
      .select(
        "id, full_name, email, phone, whatsapp_phone, company_name, service_category, service_description, status, created_at, updated_at",
      )
      .eq("id", applicationId)
      .single();

    if (!current?.id) return json({ ok: false, message: "Application not found", correlationId }, 404);

    const previousStatus = String(current.status || "");
    if (previousStatus === nextStatus && !forceNotify) {
      await insertAuditLog(supabaseAdmin, {
        user_id: authUser.id,
        action: "contractor_update_status_no_change",
        entity_type: "contractor_application",
        entity_id: applicationId,
        ip_address: ip,
        details: { correlationId, status: nextStatus, previousStatus },
      });
      return json({ ok: true, applicationId, status: nextStatus, changed: false, correlationId }, 200);
    }

    let updated: any = current;
    const statusChanged = previousStatus !== nextStatus;
    if (statusChanged) {
      const updatePayload: Record<string, unknown> = { status: nextStatus };
      if (nextStatus === "approved") {
        updatePayload.approved_at = new Date().toISOString();
        updatePayload.approved_by = authUser.id;
      }
      if (nextStatus === "rejected") {
        updatePayload.approved_at = null;
        updatePayload.approved_by = null;
      }

      const { data: updatedRow, error: updateError } = await supabaseAdmin
        .from("contractor_applications")
        .update(updatePayload)
        .eq("id", applicationId)
        .select(
          "id, full_name, email, phone, whatsapp_phone, company_name, service_category, service_description, status, created_at, updated_at",
        )
        .single();

      if (updateError || !updatedRow?.id) {
        await insertAuditLog(supabaseAdmin, {
          user_id: authUser.id,
          action: "contractor_update_status_failed",
          entity_type: "contractor_application",
          entity_id: applicationId,
          ip_address: ip,
          details: { correlationId, error: updateError?.message || "Update failed", nextStatus, previousStatus },
        });
        return json({ ok: false, message: updateError?.message || "Update failed", correlationId }, 400);
      }
      updated = updatedRow;

      await insertAuditLog(supabaseAdmin, {
        user_id: authUser.id,
        action: "contractor_update_status_changed",
        entity_type: "contractor_application",
        entity_id: updated.id,
        ip_address: ip,
        details: { correlationId, nextStatus, previousStatus },
      });
    } else {
      await insertAuditLog(supabaseAdmin, {
        user_id: authUser.id,
        action: "contractor_update_status_force_notify",
        entity_type: "contractor_application",
        entity_id: applicationId,
        ip_address: ip,
        details: { correlationId, status: nextStatus, previousStatus },
      });
    }

    const updatedEmail = String(updated.email || "").trim().toLowerCase();
    const warnings: string[] = [];
    if (updatedEmail) {
      const roleStatus =
        nextStatus === "approved"
          ? "approved"
          : nextStatus === "rejected"
            ? "rejected"
            : "pending";

      const { error: roleUpsertError } = await supabaseAdmin
        .from("user_roles")
        .upsert(
          {
            email: updatedEmail,
            role: "contractor",
            status: roleStatus,
            updated_by: authUser.id,
          },
          { onConflict: "email" },
        );
      if (roleUpsertError) {
        warnings.push(`user_roles_upsert_failed:${roleUpsertError.message}`);
        await insertAuditLog(supabaseAdmin, {
          user_id: authUser.id,
          action: "contractor_user_roles_upsert_failed",
          entity_type: "contractor_application",
          entity_id: updated.id,
          ip_address: ip,
          details: { correlationId, error: roleUpsertError.message, email: updatedEmail, roleStatus },
        });
      } else {
        await insertAuditLog(supabaseAdmin, {
          user_id: authUser.id,
          action: "contractor_user_roles_upserted",
          entity_type: "contractor_application",
          entity_id: updated.id,
          ip_address: ip,
          details: { correlationId, email: updatedEmail, roleStatus },
        });
      }
    }

    const cfg = await getN8nConfig(supabaseAdmin);
    const n8nSent = await postToN8n(cfg, {
      type: "contractor_status_changed",
      timestamp: new Date().toISOString(),
      data: {
        application_id: updated.id,
        previous_status: previousStatus,
        status: nextStatus,
        full_name: updated.full_name,
        email: updated.email,
        phone: updated.phone,
        whatsapp_phone: (updated as any).whatsapp_phone,
        company_name: (updated as any).company_name,
        service_category: updated.service_category,
        service_description: updated.service_description,
        created_at: updated.created_at,
        updated_at: updated.updated_at,
      },
    });

    let inviteToken: string | null = null;
    let inviteLink: string | null = null;
    if (nextStatus === "approved") {
      const { data: existingInvites } = await supabaseAdmin
        .from("contractor_invites")
        .select("token")
        .eq("application_id", updated.id)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1);
      const existingToken = existingInvites?.[0]?.token ? String(existingInvites[0].token) : null;

      if (existingToken) {
        inviteToken = existingToken;
        await insertAuditLog(supabaseAdmin, {
          user_id: authUser.id,
          action: "contractor_invite_reused",
          entity_type: "contractor_application",
          entity_id: updated.id,
          ip_address: ip,
          details: { correlationId },
        });
      } else {
        const { data: inviteRow, error: inviteInsertError } = await supabaseAdmin
          .from("contractor_invites")
          .insert({ application_id: updated.id })
          .select("token")
          .single();
        inviteToken = inviteRow?.token ? String(inviteRow.token) : null;
        if (inviteInsertError) {
          warnings.push(`contractor_invite_insert_failed:${inviteInsertError.message}`);
          await insertAuditLog(supabaseAdmin, {
            user_id: authUser.id,
            action: "contractor_invite_create_failed",
            entity_type: "contractor_application",
            entity_id: updated.id,
            ip_address: ip,
            details: { correlationId, error: inviteInsertError.message },
          });
        }
      }
      inviteLink =
        inviteToken && effectiveBaseUrl
          ? `${effectiveBaseUrl.replace(/\/$/, "")}/portal-contratistas/invitacion?token=${encodeURIComponent(inviteToken)}`
          : null;
      await insertAuditLog(supabaseAdmin, {
        user_id: authUser.id,
        action: "contractor_invite_ready",
        entity_type: "contractor_application",
        entity_id: updated.id,
        ip_address: ip,
        details: {
          correlationId,
          inviteTokenReady: Boolean(inviteToken),
          inviteLinkReady: Boolean(inviteLink),
          effectiveBaseUrl: effectiveBaseUrl || null,
        },
      });
    }

    let authCreatedOrLinked = false;
    let authAdminLinkType: "invite" | "recovery" | null = null;
    let authAdminActionLink: string | null = null;
    let contractorAuthUserId: string | null = null;
    let contractorProfileUpserted = false;
    if (nextStatus === "approved" && updatedEmail) {
      const redirectTo = inviteLink || (effectiveBaseUrl ? `${effectiveBaseUrl.replace(/\/$/, "")}/auth` : undefined);
      const suggestedName = String((updated as any)?.full_name || (updated as any)?.company_name || updatedEmail.split("@")[0] || "Contratista").trim();
      try {
        const inviteRes: any = await (supabaseAdmin as any).auth.admin.generateLink({
          type: "invite",
          email: updatedEmail,
          options: redirectTo ? { redirectTo, data: { name: suggestedName } } : { data: { name: suggestedName } },
        });

        if (inviteRes?.error) {
          const msg = String(inviteRes.error?.message || "");
          const shouldRecovery =
            msg.toLowerCase().includes("already") ||
            msg.toLowerCase().includes("registered") ||
            msg.toLowerCase().includes("exists");
          if (shouldRecovery) {
            const recRes: any = await (supabaseAdmin as any).auth.admin.generateLink({
              type: "recovery",
              email: updatedEmail,
              options: redirectTo ? { redirectTo, data: { name: suggestedName } } : { data: { name: suggestedName } },
            });
            if (recRes?.error) {
              warnings.push(`auth_generate_link_failed:${String(recRes.error?.message || "unknown")}`);
              await insertAuditLog(supabaseAdmin, {
                user_id: authUser.id,
                action: "contractor_auth_link_failed",
                entity_type: "contractor_application",
                entity_id: updated.id,
                ip_address: ip,
                details: { correlationId, email: updatedEmail, error: String(recRes.error?.message || "unknown") },
              });
            } else {
              authCreatedOrLinked = true;
              authAdminLinkType = "recovery";
              authAdminActionLink = recRes?.data?.properties?.action_link
                ? String(recRes.data.properties.action_link)
                : null;
              contractorAuthUserId = recRes?.data?.user?.id ? String(recRes.data.user.id) : null;
            }
          } else {
            warnings.push(`auth_generate_link_failed:${msg || "unknown"}`);
            await insertAuditLog(supabaseAdmin, {
              user_id: authUser.id,
              action: "contractor_auth_link_failed",
              entity_type: "contractor_application",
              entity_id: updated.id,
              ip_address: ip,
              details: { correlationId, email: updatedEmail, error: msg || "unknown" },
            });
          }
        } else {
          authCreatedOrLinked = true;
          authAdminLinkType = "invite";
          authAdminActionLink = inviteRes?.data?.properties?.action_link ? String(inviteRes.data.properties.action_link) : null;
          contractorAuthUserId = inviteRes?.data?.user?.id ? String(inviteRes.data.user.id) : null;
        }

        if (authCreatedOrLinked) {
          await insertAuditLog(supabaseAdmin, {
            user_id: authUser.id,
            action: "contractor_auth_link_ready",
            entity_type: "contractor_application",
            entity_id: updated.id,
            ip_address: ip,
            details: {
              correlationId,
              email: updatedEmail,
              type: authAdminLinkType,
              hasActionLink: Boolean(authAdminActionLink),
              hasUserId: Boolean(contractorAuthUserId),
              redirectTo: redirectTo || null,
            },
          });
        }

        if (contractorAuthUserId) {
          const { error: appAuthUpdateError } = await supabaseAdmin
            .from("contractor_applications")
            .update({ auth_user_id: contractorAuthUserId })
            .eq("id", updated.id);
          if (appAuthUpdateError) {
            warnings.push(`contractor_app_auth_user_id_update_failed:${appAuthUpdateError.message}`);
          }

          const { error: userProfileUpdateError } = await supabaseAdmin
            .from("users")
            .update({ role: "contractor", name: suggestedName, updated_at: new Date().toISOString() })
            .eq("id", contractorAuthUserId);
          if (userProfileUpdateError) {
            warnings.push(`users_role_update_failed:${userProfileUpdateError.message}`);
          }

          const { error: roleFixError } = await supabaseAdmin
            .from("user_roles")
            .upsert(
              {
                email: updatedEmail,
                role: "contractor",
                status: "approved",
                updated_by: authUser.id,
              },
              { onConflict: "email" },
            );
          if (roleFixError) {
            warnings.push(`user_roles_force_contractor_failed:${roleFixError.message}`);
          }

          const { error: contractorProfileError } = await supabaseAdmin
            .from("contractor_profiles")
            .upsert(
              {
                user_id: contractorAuthUserId,
                application_id: updated.id,
                full_name: (updated as any)?.full_name ?? null,
                phone: (updated as any)?.phone ?? null,
                whatsapp_phone: (updated as any)?.whatsapp_phone ?? null,
                company_name: (updated as any)?.company_name ?? null,
              },
              { onConflict: "user_id" },
            );
          if (contractorProfileError) {
            warnings.push(`contractor_profiles_upsert_failed:${contractorProfileError.message}`);
            await insertAuditLog(supabaseAdmin, {
              user_id: authUser.id,
              action: "contractor_profile_upsert_failed",
              entity_type: "contractor_application",
              entity_id: updated.id,
              ip_address: ip,
              details: { correlationId, error: contractorProfileError.message, contractorAuthUserId },
            });
          } else {
            contractorProfileUpserted = true;
            await insertAuditLog(supabaseAdmin, {
              user_id: authUser.id,
              action: "contractor_profile_upserted",
              entity_type: "contractor_application",
              entity_id: updated.id,
              ip_address: ip,
              details: { correlationId, contractorAuthUserId },
            });
          }
        }
      } catch (e) {
        warnings.push(`auth_generate_link_failed:${e instanceof Error ? e.message : String(e)}`);
        await insertAuditLog(supabaseAdmin, {
          user_id: authUser.id,
          action: "contractor_auth_link_failed",
          entity_type: "contractor_application",
          entity_id: updated.id,
          ip_address: ip,
          details: { correlationId, email: updatedEmail, error: e instanceof Error ? e.message : String(e) },
        });
      }
    }

    const notificationRules = (await getAppSetting(supabaseAdmin, "notification_rules")) as any;
    const emailTemplates = (await getAppSetting(supabaseAdmin, "email_templates")) as any;

    const emailEventKey =
      nextStatus === "reviewing"
        ? "contractor_reviewing"
        : nextStatus === "approved"
          ? "contractor_approved"
          : nextStatus === "rejected"
            ? "contractor_rejected"
            : null;

    let emailProviderId: string | null = null;
    let emailOutboxId: string | null = null;
    let emailEnqueued = false;
    let emailSkipped = false;
    if (notify && emailEventKey) {
      const emailEnabled = resolveBoolean(notificationRules?.email?.[emailEventKey], true);
      if (emailEnabled) {
        const toEmail = String(updated.email || "").trim().toLowerCase();
        if (!toEmail) {
          emailSkipped = true;
        } else {
          const company = (await getCompanySettings(supabaseAdmin)) as any;
          const companyName = String(company?.company_name || "Integrated Home Solutions");
          const tmpl = (emailTemplates?.[emailEventKey] ?? {}) as any;
          const subject =
            normalizeOptionalString(tmpl?.subject) || defaultContractorSubject({ companyName, status: nextStatus });
          const htmlTemplate =
            normalizeOptionalString(tmpl?.html) || defaultContractorEmailHtml({ companyName, status: nextStatus });

          let html = renderTemplate(htmlTemplate, {
            fullName: String(updated.full_name || ""),
            companyName,
            status: nextStatus,
          });

          if (nextStatus === "approved" && inviteLink) {
            html = `${html}<div style="margin-top:16px;"><a href="${inviteLink}" target="_blank" rel="noopener noreferrer">Acceder al Portal de Contratistas</a></div>`;
          }
          if (nextStatus === "approved" && authAdminActionLink) {
            html = `${html}<div style="margin-top:12px;"><a href="${authAdminActionLink}" target="_blank" rel="noopener noreferrer">Activar cuenta y establecer contraseña</a></div>`;
          }

          const { data: enq, error: enqErr } = await supabaseAdmin
            .from("email_outbox")
            .insert({
              idempotency_key: `contractor:${updated.id}:${emailEventKey}:${nextStatus}`,
              status: "pending",
              priority: 20,
              to_email: toEmail,
              subject,
              html,
              from_email: resendFromEmail || null,
              template_key: emailEventKey,
              template_vars: { fullName: String(updated.full_name || ""), companyName, status: nextStatus },
              metadata: { contractor_application_id: updated.id, status: nextStatus, correlationId },
            })
            .select("id")
            .single();

          if (enqErr || !enq?.id) {
            warnings.push(`email_enqueue_failed:${String(enqErr?.message || "unknown")}`);
            await insertAuditLog(supabaseAdmin, {
              user_id: authUser.id,
              action: "contractor_email_enqueue_failed",
              entity_type: "contractor_application",
              entity_id: updated.id,
              ip_address: ip,
              details: { correlationId, emailEventKey, error: String(enqErr?.message || "unknown") },
            });
            emailSkipped = true;
          } else {
            emailOutboxId = enq.id;
            emailEnqueued = true;
            await insertAuditLog(supabaseAdmin, {
              user_id: authUser.id,
              action: "contractor_email_enqueued",
              entity_type: "contractor_application",
              entity_id: updated.id,
              ip_address: ip,
              details: { correlationId, emailEventKey, emailOutboxId },
            });
          }
        }
      }
    }

    return json(
      {
        ok: true,
        applicationId: updated.id,
        status: nextStatus,
        previousStatus,
        changed: statusChanged,
        n8nSent,
        emailProviderId,
        emailOutboxId,
        emailEnqueued,
        emailSkipped,
        inviteToken,
        inviteLink,
        auth: {
          createdOrLinked: authCreatedOrLinked,
          linkType: authAdminLinkType,
          userId: contractorAuthUserId,
          actionLink: role === "super_admin" ? authAdminActionLink : null,
          profileUpserted: contractorProfileUpserted,
        },
        correlationId,
        warnings,
      },
      200,
    );
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e), correlationId }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidStatus(value: string): value is ContractorStatus {
  return ["submitted", "nda_sent", "reviewing", "approved", "rejected"].includes(value);
}

function normalizeOptionalString(value: unknown) {
  const str = String(value ?? "").trim();
  return str ? str : null;
}

function resolveBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function safeText(input: string) {
  const s = String(input ?? "");
  return s.length > 500 ? `${s.slice(0, 500)}…` : s;
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderTemplate(input: string, vars: Record<string, string>) {
  let out = String(input ?? "");
  Object.entries(vars).forEach(([k, v]) => {
    out = out.replaceAll(`{{${k}}}`, escapeHtml(String(v ?? "")));
  });
  return out;
}

function defaultContractorSubject(opts: { companyName: string; status: ContractorStatus }) {
  if (opts.status === "reviewing") return `Tu solicitud está siendo evaluada - ${opts.companyName}`;
  if (opts.status === "approved") return `Solicitud aprobada - ${opts.companyName}`;
  if (opts.status === "rejected") return `Actualización de tu solicitud - ${opts.companyName}`;
  return `Actualización de tu solicitud - ${opts.companyName}`;
}

function defaultContractorEmailHtml(opts: { companyName: string; status: ContractorStatus }) {
  if (opts.status === "reviewing") {
    return `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
        <h2>Hola, {{fullName}}.</h2>
        <p>Gracias por postularte. Tu solicitud está siendo evaluada por ${escapeHtml(opts.companyName)}.</p>
        <p>Te contactaremos si necesitamos información adicional.</p>
        <p style="color:#64748b;font-size:12px;">Este correo fue enviado automáticamente.</p>
      </div>
    `;
  }
  if (opts.status === "approved") {
    return `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
        <h2>Hola, {{fullName}}.</h2>
        <p>¡Buenas noticias! Tu solicitud fue aprobada por ${escapeHtml(opts.companyName)}.</p>
        <p>Nos pondremos en contacto contigo con los siguientes pasos.</p>
        <p style="color:#64748b;font-size:12px;">Este correo fue enviado automáticamente.</p>
      </div>
    `;
  }
  if (opts.status === "rejected") {
    return `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
        <h2>Hola, {{fullName}}.</h2>
        <p>Gracias por tu interés. Por el momento, tu solicitud no fue aprobada.</p>
        <p>Si aplica, podremos considerarte en futuras oportunidades.</p>
        <p style="color:#64748b;font-size:12px;">Este correo fue enviado automáticamente.</p>
      </div>
    `;
  }
  return `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
      <h2>Hola, {{fullName}}.</h2>
      <p>Te compartimos una actualización sobre tu solicitud.</p>
      <p style="color:#64748b;font-size:12px;">Este correo fue enviado automáticamente.</p>
    </div>
  `;
}

async function getCompanySettings(supabaseAdmin: any) {
  const { data } = await supabaseAdmin
    .from("company_settings")
    .select("company_name, email")
    .eq("is_singleton", true)
    .maybeSingle();
  return data || null;
}

async function getAppSetting(supabaseAdmin: any, key: string) {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

async function getN8nConfig(supabaseAdmin: any): Promise<{ enabled: boolean; webhookUrl: string; syncEnabled: boolean }> {
  try {
    const { data: cfg } = await supabaseAdmin
      .from("integration_configs")
      .select("status, config_json")
      .eq("type", "n8n")
      .single();

    const enabled = cfg?.status === "enabled";
    const webhookUrl = enabled ? String((cfg as any)?.config_json?.webhookUrl || "") : "";
    const syncEnabled = enabled ? Boolean((cfg as any)?.config_json?.syncEnabled) : false;
    return { enabled, webhookUrl, syncEnabled };
  } catch {
    return { enabled: false, webhookUrl: "", syncEnabled: false };
  }
}

async function postToN8n(
  cfg: { enabled: boolean; webhookUrl: string; syncEnabled: boolean },
  payload: { type: string; timestamp: string; data: any },
) {
  if (!cfg.enabled || !cfg.syncEnabled || !cfg.webhookUrl) return false;
  try {
    const res = await fetch(cfg.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendEmail(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    return { ok: false, message: `Email provider error (${res.status}): ${safeText(text)}` };
  }

  let payload: any = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }

  const id = payload?.id ? String(payload.id) : "";
  if (!id) {
    return { ok: false, message: "Email provider response missing id" };
  }
  return { ok: true, id };
}

function getIp(req: Request) {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || null;
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  return null;
}

async function insertAuditLog(
  supabaseAdmin: any,
  row: {
    user_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    details: Record<string, unknown>;
    ip_address: string | null;
  },
) {
  try {
    const payload: Record<string, unknown> = {
      user_id: row.user_id,
      action: row.action,
      entity_type: row.entity_type,
      details: row.details,
      ip_address: row.ip_address,
    };
    if (row.entity_id) payload.entity_id = row.entity_id;
    await supabaseAdmin.from("audit_logs").insert(payload);
  } catch (e) {
    console.error("audit_log_insert_failed", e);
  }
}

import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Upload } from 'lucide-react';
import { buildDocumentStoragePath } from '../../utils/documents';
import { useSettings } from '../../context/SettingsContext';

interface DocumentUploadProps {
  onClose: () => void;
  onUploadComplete: () => void;
  propertyId?: string;
}

export const DocumentUpload: React.FC<DocumentUploadProps> = ({ onClose, onUploadComplete, propertyId }) => {
  const { t } = useSettings();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('contract');
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      if (!name) {
        setName(e.target.files[0].name);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    try {
      setUploading(true);
      
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error('User not authenticated');

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('id')
        .eq('email', user.email)
        .single();

      const profileId = profileError ? null : profile?.id;

      // 1. Upload to Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = buildDocumentStoragePath(propertyId, fileName);

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. Insert into documents table
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .insert({
          property_id: propertyId,
          name,
          type,
          current_version: 1,
          created_by: profileId
        })
        .select()
        .single();

      if (docError) throw docError;

      // 3. Insert into document_versions table
      const { error: versionError } = await supabase
        .from('document_versions')
        .insert({
          document_id: docData.id,
          version_number: 1,
          file_path: filePath,
          file_size: file.size,
          mime_type: file.type,
          uploaded_by: profileId,
          change_log: 'Initial upload'
        });

      if (versionError) throw versionError;
      
       // Create Notification logic
       if (propertyId) {
         // Find property details (owner and assigned admin)
         const { data: prop } = await supabase
            .from('properties')
            .select('owner_id, assigned_admin_id')
            .eq('id', propertyId)
            .single();

         if (prop) {
            const uploaderIsOwner = !!profileId && profileId === prop.owner_id;
            
            if (uploaderIsOwner) {
                // Notify Admin
                if (prop.assigned_admin_id) {
                    await supabase.from('notifications').insert({
                        user_id: prop.assigned_admin_id,
                        title: t('notificationOwnerUploadedTitle'),
                        message: `${t('notificationOwnerUploadedPrefix')}${name}`,
                        type: 'info',
                        link: '/admin?tab=properties'
                    });
                }
            } else {
                // Notify Owner (if uploader is admin/other)
                if (prop.owner_id) {
                    await supabase.from('notifications').insert({
                        user_id: prop.owner_id,
                        title: t('notificationNewDocAvailableTitle'),
                        message: `${t('notificationNewDocAvailablePrefix')}${name}`,
                        type: 'success',
                        link: '/portal?tab=documents'
                    });
                }
            }
         }
       }

      // 4. Create Audit Log (Client side for now, or assume Trigger)
      // For now, we rely on the implementation detail or add explicit log later.

      onUploadComplete();
      onClose();
    } catch (error) {
      console.error('Error uploading document:', error);
      alert(t('uploadError'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">{t('uploadDocumentModalTitle')}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('documentNameLabel')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('documentTypeLabel')}</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="contract">{t('documentTypeContract')}</option>
              <option value="invoice">{t('documentTypeInvoice')}</option>
              <option value="report">{t('documentTypeReport')}</option>
              <option value="other">{t('documentTypeOther')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('documentFileLabel')}</label>
            <input
              type="file"
              onChange={handleFileChange}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              required
            />
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="button"
              onClick={onClose}
              className="mr-2 px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={uploading || !file}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading ? t('uploading') : (
                <>
                  <Upload size={16} className="mr-2" />
                  {t('upload')}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

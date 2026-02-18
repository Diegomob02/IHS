import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Document, DocumentVersion } from '../../types';
import { X, Upload, FileText, Download } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';

interface DocumentHistoryProps {
  document: Document;
  onClose: () => void;
  onUpdate: () => void;
  isAdmin?: boolean;
}

export const DocumentHistory: React.FC<DocumentHistoryProps> = ({ document, onClose, onUpdate, isAdmin }) => {
  const { t, language } = useSettings();
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [changeLog, setChangeLog] = useState('');
  const [uploading, setUploading] = useState(false);

  const fetchVersions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('document_versions')
        .select('*')
        .eq('document_id', document.id)
        .order('version_number', { ascending: false });

      if (error) throw error;
      setVersions(data || []);
    } catch (error) {
      console.error('Error fetching versions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVersions();
  }, [document.id]);

  const handleDownload = async (path: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(path, 60);

      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (error) {
      console.error('Error downloading version:', error);
    }
  };

  const handleUploadNewVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    try {
      setUploading(true);
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error('User not authenticated');

      const nextVersion = (versions[0]?.version_number || 0) + 1;
      
      // 1. Upload file
      const fileExt = file.name.split('.').pop();
      const fileName = `${document.id}/v${nextVersion}_${Math.random().toString(36).substring(2)}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // 2. Insert version
      const { error: versionError } = await supabase
        .from('document_versions')
        .insert({
          document_id: document.id,
          version_number: nextVersion,
          file_path: fileName,
          file_size: file.size,
          mime_type: file.type,
          uploaded_by: user.id,
          change_log: changeLog
        });

      if (versionError) throw versionError;

      // 3. Update document current_version
      const { error: updateError } = await supabase
        .from('documents')
        .update({ 
            current_version: nextVersion,
            updated_at: new Date().toISOString()
        })
        .eq('id', document.id);

      if (updateError) throw updateError;

      setShowUpload(false);
      setFile(null);
      setChangeLog('');
      fetchVersions();
      onUpdate();
    } catch (error) {
      console.error('Error uploading version:', error);
      alert(t('uploadVersionError'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold">{t('documentHistoryTitlePrefix')}{document.name}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        {!showUpload ? (
          <>
            {isAdmin && (
              <div className="flex justify-end mb-4">
                <button
                  onClick={() => setShowUpload(true)}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                  <Upload size={16} />
                  {t('newVersion')}
                </button>
              </div>
            )}

            <div className="space-y-4">
              {loading ? (
                <p>{t('loadingHistory')}</p>
              ) : versions.map((version) => (
                <div key={version.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-lg">v{version.version_number}</span>
                        <span className="text-sm text-gray-500">
                          {new Date(version.created_at).toLocaleString(language === 'es' ? 'es-MX' : 'en-US')}
                        </span>
                      </div>
                      {version.change_log && (
                        <p className="text-sm text-gray-600 mt-1">
                          <span className="font-medium">{t('changesLabel')}</span> {version.change_log}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {t('uploadedByLabel')}{version.uploaded_by}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDownload(version.file_path)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-full"
                      title={t('downloadThisVersion')}
                    >
                      <Download size={20} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <form onSubmit={handleUploadNewVersion} className="space-y-4 border rounded-lg p-4 bg-gray-50">
            <h4 className="font-semibold mb-2">{t('uploadNewVersionTitle')}</h4>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('documentFileLabel')}</label>
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('changeLogLabel')}</label>
              <textarea
                value={changeLog}
                onChange={(e) => setChangeLog(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder={t('changeLogPlaceholder')}
                rows={3}
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowUpload(false)}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={uploading || !file}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {uploading ? t('uploading') : t('uploadVersion')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

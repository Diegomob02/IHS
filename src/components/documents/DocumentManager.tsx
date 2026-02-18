import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Document } from '../../types';
import { useRealtime } from '../../hooks/useRealtime';
import { FileText, Upload, History, Download } from 'lucide-react';
import { DocumentUpload } from './DocumentUpload';
import { DocumentHistory } from './DocumentHistory';
import { useSettings } from '../../context/SettingsContext';

interface DocumentManagerProps {
  propertyId?: string; // If provided, shows docs for this property. If null, shows all (admin only)
  isAdmin?: boolean;
}

export const DocumentManager: React.FC<DocumentManagerProps> = ({ propertyId, isAdmin }) => {
  const { t, language } = useSettings();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('documents')
        .select('*, property:properties(title)')
        .order('created_at', { ascending: false });

      if (propertyId) {
        query = query.eq('property_id', propertyId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [propertyId]);

  useRealtime<Document>('documents', propertyId ? `property_id=eq.${propertyId}` : undefined, (payload) => {
    if (payload.eventType === 'INSERT') {
      setDocuments((prev) => [payload.new as Document, ...prev]);
    } else if (payload.eventType === 'UPDATE') {
      setDocuments((prev) => prev.map((d) => (d.id === payload.new.id ? (payload.new as Document) : d)));
    } else if (payload.eventType === 'DELETE') {
      setDocuments((prev) => prev.filter((d) => d.id !== payload.old.id));
    }
  });

  const handleDownload = async (doc: Document) => {
    try {
      const { data: versions, error } = await supabase
        .from('document_versions')
        .select('*')
        .eq('document_id', doc.id)
        .eq('version_number', doc.current_version)
        .single();

      if (error) throw error;
      if (!versions) return;

      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('documents')
        .createSignedUrl(versions.file_path, 60);

      if (signedUrlError) throw signedUrlError;

      window.open(signedUrlData.signedUrl, '_blank');
    } catch (error) {
      console.error('Error downloading document:', error);
      alert(t('errorDownloadingDocument'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-800">{t('documentsTitle')}</h2>
        {isAdmin && (
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Upload size={18} />
            {t('uploadDocument')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-8">{t('loadingDocuments')}</div>
      ) : documents.length === 0 ? (
        <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
          <FileText className="mx-auto h-12 w-12 text-gray-400 mb-2" />
          <p>{t('noDocumentsAvailable')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {!propertyId && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('colProperty')}</th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('colName')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('colType')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('colVersion')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('colDate')}</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  {!propertyId && (
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 font-medium">{doc.property?.title || t('unassigned')}</div>
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <FileText className="h-5 w-5 text-gray-400 mr-2" />
                      <div className="text-sm font-medium text-gray-900">{doc.name}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                      {doc.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    v{doc.current_version}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(doc.updated_at).toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleDownload(doc)}
                      className="text-gray-400 hover:text-gray-600 mx-2"
                      title={t('download')}
                    >
                      <Download size={18} />
                    </button>
                    <button
                      onClick={() => {
                        setSelectedDoc(doc);
                        setShowHistoryModal(true);
                      }}
                      className="text-gray-400 hover:text-gray-600 mx-2"
                      title={t('history')}
                    >
                      <History size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {showUploadModal && isAdmin && (
        <DocumentUpload
          onClose={() => setShowUploadModal(false)}
          onUploadComplete={fetchDocuments}
          propertyId={propertyId}
        />
      )}

      {showHistoryModal && selectedDoc && (
        <DocumentHistory
          document={selectedDoc}
          onClose={() => setShowHistoryModal(false)}
          onUpdate={fetchDocuments}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
};

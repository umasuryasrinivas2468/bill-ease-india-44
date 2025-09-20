import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const PayLink: React.FC = ()=>{
  const [params] = useSearchParams();
  const linkId = params.get('link') || '';
  const [linkData, setLinkData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(()=>{
    if (!linkId) return;
    setLoading(true);
    fetch(`/payments/${linkId}`).then(r=>r.json()).then(j=>{ if (j.success) setLinkData(j.data); }).finally(()=>setLoading(false));
  }, [linkId]);

  if (!linkId) return <div className="p-4">Invalid payment link.</div>;

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-xl font-bold">Complete Payment</h1>
      {loading && <div className="mt-2">Loading...</div>}
      {linkData ? (
        <div className="mt-4 space-y-2">
          <div><strong>Amount:</strong> {(linkData.amount/100).toFixed(2)} {linkData.currency}</div>
          <div><strong>Description:</strong> {linkData.meta?.description || '—'}</div>
          <div>
            <a className="inline-block mt-2 px-4 py-2 bg-indigo-600 text-white rounded" href={linkData.short_url || linkData.long_url || linkData.link_url} target="_blank" rel="noreferrer">Open Razorpay Payment Page</a>
          </div>
          <div className="text-sm text-muted-foreground">If payment is completed, the dashboard will reflect the status.</div>
        </div>
      ) : (
        <div className="mt-4 text-sm text-muted-foreground">No data found for this link.</div>
      )}
    </div>
  );
};

export default PayLink;

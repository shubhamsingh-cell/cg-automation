import { useState } from 'react';
import { Download, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import { getDownloadUrl } from '../utils/api';

const SHEETS = [
  { name: 'Daily Action Plan', desc: 'Ranked list of locations to post today -- the primary output' },
  { name: 'All Repost Candidates', desc: 'Full repost list with triggers' },
  { name: 'Best Per Location', desc: '1 winner per location' },
  { name: 'Location Conflicts', desc: 'Filtered combos showing what beat what' },
  { name: 'Keep Running', desc: 'Healthy profitable posts' },
  { name: 'Skip', desc: 'Skipped combos with reason per row' },
  { name: 'Location Intelligence', desc: 'Best title/category/day picks per location' },
  { name: 'Frequency Optimization', desc: 'NR curves per combo' },
  { name: 'All Runs', desc: 'Complete historical run data' },
];

export default function DownloadExcel() {
  const { jobId } = useAnalysis();
  const [downloaded, setDownloaded] = useState(false);

  function handleDownload() {
    if (!jobId) return;
    const url = getDownloadUrl(jobId);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cg_automation_report_${jobId}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Download size={20} className="text-[#2E74B5]" />
        <h2 className="text-xl font-bold text-white">Download Excel Report</h2>
      </div>

      {/* Sheets Preview */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-white mb-4">9-Sheet Report Contents</h3>
        <div className="space-y-3">
          {SHEETS.map((sheet, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="flex items-center justify-center w-6 h-6 rounded bg-[#2E74B5]/15 text-[#2E74B5] text-xs font-bold shrink-0 mt-0.5">
                {i + 1}
              </div>
              <div>
                <div className="text-sm text-white font-medium">{sheet.name}</div>
                <div className="text-xs text-[#666] mt-0.5">{sheet.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Download Button */}
      <button
        onClick={handleDownload}
        disabled={!jobId}
        className={`flex items-center justify-center gap-3 w-full max-w-md py-4 rounded-xl text-sm font-semibold transition-all ${
          jobId
            ? downloaded
              ? 'bg-[#1E8449] text-white'
              : 'bg-[#2E74B5] text-white hover:bg-[#3584c5] active:scale-[0.99]'
            : 'bg-[#1a1a1a] text-[#555] cursor-not-allowed'
        }`}
      >
        {downloaded ? (
          <>
            <CheckCircle2 size={18} />
            Download started
          </>
        ) : (
          <>
            <FileSpreadsheet size={18} />
            Download Full Report (.xlsx)
          </>
        )}
      </button>

      {!jobId && (
        <p className="text-xs text-[#555] mt-3">Upload and analyse a file first to enable download.</p>
      )}
    </div>
  );
}

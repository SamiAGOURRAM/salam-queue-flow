import { useEffect, useState } from 'react';

interface HealthResponse {
  status: string;
  message: string;
  pod_id: string;
}

// Generate a unique color based on pod name hash
function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Generate vibrant HSL color (avoid too light or too dark)
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 80%, 45%)`;
}

// Get contrasting text color
function getContrastColor(hslString: string): string {
  const hue = parseInt(hslString.match(/\d+/)?.[0] || '0');
  // Light text for most colors, dark for yellows/greens
  return (hue > 50 && hue < 180) ? '#1a1a1a' : '#ffffff';
}

export function PodIndicator() {
  const [podInfo, setPodInfo] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPodInfo = async () => {
      try {
        const response = await fetch('/api/health');
        if (!response.ok) throw new Error('Failed to fetch pod info');
        const data = await response.json();
        setPodInfo(data);
        setError(null);
      } catch (err) {
        // In development mode, show a placeholder
        setPodInfo({
          status: 'dev',
          message: 'Development Mode',
          pod_id: 'local-dev-' + Math.random().toString(36).substring(7),
        });
        setError(null);
      } finally {
        setLoading(false);
      }
    };

    fetchPodInfo();
    
    // Refresh every 5 seconds to show updates
    const interval = setInterval(fetchPodInfo, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <div className="animate-pulse bg-gray-700 rounded-lg px-4 py-2 text-white text-sm">
          Loading pod info...
        </div>
      </div>
    );
  }

  if (!podInfo) return null;

  const bgColor = stringToColor(podInfo.pod_id);
  const textColor = getContrastColor(bgColor);
  const shortPodId = podInfo.pod_id.split('-').slice(-2).join('-');

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div 
        className="rounded-xl px-4 py-3 shadow-2xl backdrop-blur-sm border border-white/20"
        style={{ 
          backgroundColor: bgColor,
          color: textColor,
        }}
      >
        <div className="flex items-center gap-3">
          {/* Pulsing dot to indicate live */}
          <div className="relative">
            <div 
              className="w-3 h-3 rounded-full animate-ping absolute"
              style={{ backgroundColor: textColor, opacity: 0.4 }}
            />
            <div 
              className="w-3 h-3 rounded-full relative"
              style={{ backgroundColor: textColor }}
            />
          </div>
          
          <div className="flex flex-col">
            <span className="text-xs font-medium opacity-80">
              SERVING POD
            </span>
            <span className="font-mono font-bold text-sm tracking-wide">
              {shortPodId}
            </span>
          </div>

          {/* Visual pod icon */}
          <div className="ml-2 opacity-60">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="24" 
              height="24" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
              <line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
          </div>
        </div>

        {/* Status bar */}
        <div 
          className="mt-2 pt-2 border-t text-xs flex items-center gap-2"
          style={{ borderColor: `${textColor}33` }}
        >
          <span className="opacity-70">Status:</span>
          <span className="font-semibold uppercase">{podInfo.status}</span>
        </div>
      </div>
    </div>
  );
}


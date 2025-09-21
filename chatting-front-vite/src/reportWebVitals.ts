type ReportHandler = (metric: any) => void;

const reportWebVitals = (onPerfEntry?: ReportHandler): void => {
  if (onPerfEntry) {
    import('web-vitals').then((webVitals) => {
      webVitals.onCLS?.(onPerfEntry);
      webVitals.onINP?.(onPerfEntry);
      webVitals.onFCP?.(onPerfEntry);
      webVitals.onLCP?.(onPerfEntry);
      webVitals.onTTFB?.(onPerfEntry);
    })
  }
}

export default reportWebVitals
'use client';

/**
 * Dynamic Imports for Heavy Components
 * Lazy loads heavy dependencies to reduce initial bundle size
 */

import dynamic from 'next/dynamic';

// Loading skeleton for charts
const ChartSkeleton = () => (
  <div className="animate-pulse bg-gray-100 rounded-lg h-64 w-full flex items-center justify-center">
    <span className="text-gray-400">Loading chart...</span>
  </div>
);

// Loading skeleton for editor
const EditorSkeleton = () => (
  <div className="animate-pulse bg-gray-100 rounded border h-48 w-full flex items-center justify-center">
    <span className="text-gray-400">Loading editor...</span>
  </div>
);

/**
 * Lazy-loaded Recharts components
 * Only loads ~300kb recharts bundle when needed
 */
export const LazyLineChart = dynamic(
  () => import('recharts').then(mod => mod.LineChart),
  { 
    loading: ChartSkeleton,
    ssr: false 
  }
);

export const LazyBarChart = dynamic(
  () => import('recharts').then(mod => mod.BarChart),
  { 
    loading: ChartSkeleton,
    ssr: false 
  }
);

export const LazyPieChart = dynamic(
  () => import('recharts').then(mod => mod.PieChart),
  { 
    loading: ChartSkeleton,
    ssr: false 
  }
);

export const LazyAreaChart = dynamic(
  () => import('recharts').then(mod => mod.AreaChart),
  { 
    loading: ChartSkeleton,
    ssr: false 
  }
);

// Export recharts sub-components for convenience
export const RechartsComponents = dynamic(
  () => import('recharts').then(mod => ({
    default: {
      ResponsiveContainer: mod.ResponsiveContainer,
      XAxis: mod.XAxis,
      YAxis: mod.YAxis,
      CartesianGrid: mod.CartesianGrid,
      Tooltip: mod.Tooltip,
      Legend: mod.Legend,
      Line: mod.Line,
      Bar: mod.Bar,
      Pie: mod.Pie,
      Cell: mod.Cell,
      Area: mod.Area,
    }
  })),
  { ssr: false }
);

/**
 * Lazy-loaded Markdown Editor
 * Only loads when editing notes
 */
export const LazyMDEditor = dynamic(
  () => import('@uiw/react-md-editor').then(mod => mod.default),
  { 
    loading: EditorSkeleton,
    ssr: false 
  }
);

export const LazyMDPreview = dynamic(
  () => import('@uiw/react-md-editor').then(mod => mod.default.Markdown),
  { 
    ssr: false 
  }
);

/**
 * Lazy-loaded XLSX for import/export
 * Only loads when user imports/exports files (~500kb)
 */
export const loadXLSX = () => import('xlsx');

/**
 * Helper to parse Excel/CSV file lazily
 */
export async function parseExcelFile(file) {
  const XLSX = await loadXLSX();
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(firstSheet);
}

/**
 * Helper to create Excel file lazily
 */
export async function createExcelFile(data, filename) {
  const XLSX = await loadXLSX();
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  XLSX.writeFile(workbook, filename);
}

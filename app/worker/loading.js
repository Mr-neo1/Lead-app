export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Skeleton */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="h-6 w-24 bg-white/20 rounded animate-pulse"></div>
          <div className="flex gap-2">
            <div className="h-8 w-8 bg-white/20 rounded animate-pulse"></div>
            <div className="h-8 w-8 bg-white/20 rounded animate-pulse"></div>
          </div>
        </div>
      </div>
      
      {/* Stats Skeleton */}
      <div className="p-4">
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-lg p-3 animate-pulse">
              <div className="h-6 w-8 bg-gray-200 rounded mx-auto mb-1"></div>
              <div className="h-3 w-12 bg-gray-200 rounded mx-auto"></div>
            </div>
          ))}
        </div>
        
        {/* Search Skeleton */}
        <div className="h-10 bg-gray-200 rounded-full mb-4 animate-pulse"></div>
        
        {/* Contact Cards Skeleton */}
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 bg-gray-200 rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 w-32 bg-gray-200 rounded mb-2"></div>
                  <div className="h-3 w-24 bg-gray-200 rounded"></div>
                </div>
                <div className="h-6 w-6 bg-gray-200 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

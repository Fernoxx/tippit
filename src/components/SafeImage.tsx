import { useState } from 'react';

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
  onError?: (error: any) => void;
  loading?: 'lazy' | 'eager';
}

export default function SafeImage({ 
  src, 
  alt, 
  className, 
  fallback, 
  onError,
  loading = 'lazy' 
}: SafeImageProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    console.log('Failed to load image:', src);
    setHasError(true);
    setIsLoading(false);
    if (onError) {
      onError(e);
    }
  };

  const handleLoad = () => {
    setIsLoading(false);
  };

  if (hasError) {
    return fallback ? <>{fallback}</> : null;
  }

  return (
    <>
      {isLoading && (
        <div className={`${className} bg-gray-200 animate-pulse`} />
      )}
      <img
        src={src}
        alt={alt}
        className={`${className} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-200`}
        onError={handleError}
        onLoad={handleLoad}
        loading={loading}
        style={{ display: hasError ? 'none' : 'block' }}
      />
    </>
  );
}
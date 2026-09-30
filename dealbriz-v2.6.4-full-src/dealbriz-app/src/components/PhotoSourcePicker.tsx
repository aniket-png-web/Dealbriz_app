import React, { useRef } from 'react';
import { Camera, ImageIcon } from 'lucide-react';

interface PhotoSourcePickerProps {
  onFile: (file: File) => void;
  label?: string;
  disabled?: boolean;
  compact?: boolean;
}

/**
 * Two explicit choices instead of Android's silent default.
 *
 * The `capture` attribute is what separates them: with it the WebView launches
 * the camera app directly, without it the gallery/file picker opens. Both are
 * plain file inputs, so no Capacitor camera plugin is needed - and the APK
 * already declares android.permission.CAMERA, so nothing else has to change.
 */
export const PhotoSourcePicker: React.FC<PhotoSourcePickerProps> = ({
  onFile,
  label,
  disabled,
  compact,
}) => {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    e.target.value = '';
  };

  const btn = compact
    ? 'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold border active:scale-95 transition-all disabled:opacity-50'
    : 'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border active:scale-95 transition-all disabled:opacity-50';

  return (
    <div className="w-full">
      {label && <p className="text-[11px] font-bold text-slate-600 mb-1.5">{label}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => cameraRef.current?.click()}
          className={`${btn} bg-blue-600 border-blue-600 text-white shadow-sm`}
        >
          <Camera className="w-4 h-4" />
          Take Photo
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => galleryRef.current?.click()}
          className={`${btn} bg-white border-slate-300 text-slate-800`}
        >
          <ImageIcon className="w-4 h-4" />
          Browse Device
        </button>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handle}
        className="hidden"
      />
      <input ref={galleryRef} type="file" accept="image/*" onChange={handle} className="hidden" />
    </div>
  );
};

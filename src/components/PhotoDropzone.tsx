import { useRef, useState } from "react";
import "./PhotoDropzone.css";

export interface PhotoData {
  name: string;
  dataUrl: string; // base64 data URL
}

interface Props {
  photos: PhotoData[];
  onChange: (photos: PhotoData[]) => void;
  maxPhotos?: number;
}

export function PhotoDropzone({ photos, onChange, maxPhotos = 2 }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function readFiles(files: FileList | File[]) {
    const remaining = maxPhotos - photos.length;
    const toRead = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, remaining);
    if (toRead.length === 0) return;

    let loaded = 0;
    const newPhotos: PhotoData[] = [];

    toRead.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        newPhotos.push({ name: file.name, dataUrl: e.target?.result as string });
        loaded++;
        if (loaded === toRead.length) {
          onChange([...photos, ...newPhotos]);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    readFiles(e.dataTransfer.files);
  }

  function handleRemove(index: number) {
    onChange(photos.filter((_, i) => i !== index));
  }

  const canAdd = photos.length < maxPhotos;

  return (
    <div className="photo-dropzone-wrap">
      {/* Thumbnails des photos ajoutées */}
      {photos.length > 0 && (
        <div className="photo-thumbs">
          {photos.map((p, i) => (
            <div key={i} className="photo-thumb">
              <img src={p.dataUrl} alt={p.name} className="photo-thumb-img" />
              <button
                type="button"
                className="photo-thumb-remove"
                onClick={() => handleRemove(i)}
                aria-label="Supprimer la photo"
              >
                ✕
              </button>
              <span className="photo-thumb-name">{p.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Zone de dépôt — visible uniquement si on peut encore ajouter */}
      {canAdd && (
        <div
          className={`photo-drop-area${dragging ? " dragging" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <span className="photo-drop-icon">🖼️</span>
          <p className="photo-drop-label">
            {photos.length === 0
              ? "Glissez des photos ici ou cliquez pour sélectionner"
              : "Ajouter une autre photo"}
          </p>
          <p className="photo-drop-hint">
            JPG, PNG, WEBP · max {maxPhotos} photo{maxPhotos > 1 ? "s" : ""}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="photo-drop-input"
            onChange={(e) => e.target.files && readFiles(e.target.files)}
          />
        </div>
      )}
    </div>
  );
}

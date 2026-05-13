import { useRef, useState } from "react";
import "./PhotoDropzone.css";

export interface PhotoData {
  name: string;
  dataUrl: string; // base64 data URL
}

interface Props {
  photos: PhotoData[];
  onChange: (photos: PhotoData[]) => void;
}

export function PhotoDropzone({ photos, onChange }: Props) {
  const addRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceIndexRef = useRef<number>(-1);
  const [dragging, setDragging] = useState(false);

  function readFile(file: File): Promise<PhotoData> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve({ name: file.name, dataUrl: e.target?.result as string });
      reader.readAsDataURL(file);
    });
  }

  async function addFiles(files: FileList | File[]) {
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    const newPhotos = await Promise.all(images.map(readFile));
    onChange([...photos, ...newPhotos]);
  }

  async function replaceFile(files: FileList | File[]) {
    const file = Array.from(files).find((f) => f.type.startsWith("image/"));
    if (!file || replaceIndexRef.current < 0) return;
    const photo = await readFile(file);
    const next = [...photos];
    next[replaceIndexRef.current] = photo;
    onChange(next);
    replaceIndexRef.current = -1;
  }

  function handleRemove(index: number) {
    onChange(photos.filter((_, i) => i !== index));
  }

  function handleReplace(index: number) {
    replaceIndexRef.current = index;
    if (replaceRef.current) { replaceRef.current.value = ""; replaceRef.current.click(); }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  return (
    <div className="photo-dropzone-wrap">
      {/* Zone de dépôt — toujours visible */}
      <div
        className={`photo-drop-area${dragging ? " dragging" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <svg className="photo-drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="11" x2="12" y2="17"/>
          <line x1="9" y1="14" x2="15" y2="14"/>
        </svg>
        <p className="photo-drop-label">
          {photos.length === 0 ? "Glissez vos photos ici" : "Ajouter d'autres photos"}
        </p>
        <p className="photo-drop-hint">JPG, PNG, WEBP</p>
        <span className="photo-drop-or">ou</span>
        <button
          type="button"
          className="photo-drop-btn"
          onClick={() => { if (addRef.current) { addRef.current.value = ""; addRef.current.click(); } }}
        >
          Parcourir les fichiers
        </button>
        <input ref={addRef} type="file" accept="image/*" multiple className="photo-drop-input" onChange={(e) => e.target.files && addFiles(e.target.files)} />
        <input ref={replaceRef} type="file" accept="image/*" className="photo-drop-input" onChange={(e) => e.target.files && replaceFile(e.target.files)} />
      </div>

      {/* Liste des fichiers importés — sous la dropzone */}
      {photos.length > 0 && (
        <ul className="photo-file-list">
          {photos.map((p, i) => (
            <li key={i} className="photo-file-item">
              <svg className="photo-file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <span className="photo-file-name">{p.name}</span>
              <button type="button" className="photo-file-btn" onClick={() => handleReplace(i)}>Remplacer</button>
              <button type="button" className="photo-file-btn photo-file-btn--danger" onClick={() => handleRemove(i)}>Supprimer</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

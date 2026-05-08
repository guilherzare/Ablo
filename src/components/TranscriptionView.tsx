import "./TranscriptionView.css";

interface Props {
  text: string;
  onChange: (text: string) => void;
  onContinue: () => void;
}

export function TranscriptionView({ text, onChange, onContinue }: Props) {
  return (
    <div className="transcription-view">
      <div className="transcription-header">
        <h2>Transcription brute</h2>
        <p className="transcription-hint">
          Relisez et corrigez les éventuelles erreurs de reconnaissance avant de continuer.
        </p>
      </div>

      <textarea
        className="transcription-textarea"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="La transcription apparaîtra ici…"
        rows={12}
        spellCheck
        lang="fr"
      />

      <div className="transcription-footer">
        <span className="word-count">
          {text.trim() ? `${text.trim().split(/\s+/).length} mots` : ""}
        </span>
        <button
          className="btn-continue"
          onClick={onContinue}
          disabled={!text.trim()}
        >
          Continuer → Anonymisation
        </button>
      </div>
    </div>
  );
}

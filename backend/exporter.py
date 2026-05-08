"""
Export du bilan en Word (.docx) et PDF.
Émet des lignes JSON sur stdout pour le streaming de progression.
"""
import json
import datetime
import uuid
from pathlib import Path

try:
    from docx import Document
    from docx.shared import Pt, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    _DOCX_AVAILABLE = True
except ImportError:
    _DOCX_AVAILABLE = False

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    _PDF_AVAILABLE = True
except ImportError:
    _PDF_AVAILABLE = False

from settings_manager import get_settings


def _emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def _output_dir() -> Path:
    settings = get_settings()
    folder = settings.get("export_folder", "~/Documents/Oralis")
    path = Path(folder).expanduser()
    path.mkdir(parents=True, exist_ok=True)
    return path


def _make_filename(session_id: str) -> str:
    date_str = datetime.date.today().strftime("%Y%m%d")
    return f"bilan_{date_str}_{session_id}"


def _export_docx(sections: list[dict], template_name: str, out_dir: Path, filename: str) -> Path:
    doc = Document()

    # Titre principal
    title_para = doc.add_paragraph()
    title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title_para.add_run(template_name)
    run.bold = True
    run.font.size = Pt(16)

    # Date
    date_para = doc.add_paragraph()
    date_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    date_para.add_run(datetime.date.today().strftime("%d/%m/%Y")).font.size = Pt(11)

    doc.add_paragraph()

    for s in sections:
        heading = doc.add_heading(s["title"], level=1)
        heading.runs[0].font.size = Pt(12)

        content = s.get("content", "").strip()
        if content:
            for para_text in content.split("\n"):
                if para_text.strip():
                    doc.add_paragraph(para_text.strip())
        else:
            p = doc.add_paragraph()
            run = p.add_run("[Section non renseignée]")
            run.italic = True
            run.font.color.rgb = RGBColor(0x9C, 0xA3, 0xAF)

        doc.add_paragraph()

    dest = out_dir / f"{filename}.docx"
    doc.save(str(dest))
    return dest


def _export_pdf(sections: list[dict], template_name: str, out_dir: Path, filename: str) -> Path:
    dest = out_dir / f"{filename}.pdf"
    styles = getSampleStyleSheet()

    doc = SimpleDocTemplate(
        str(dest),
        pagesize=A4,
        rightMargin=2.5 * cm,
        leftMargin=2.5 * cm,
        topMargin=2.5 * cm,
        bottomMargin=2.5 * cm,
    )

    story = []
    story.append(Paragraph(template_name, styles["Title"]))
    story.append(Paragraph(datetime.date.today().strftime("%d/%m/%Y"), styles["Normal"]))
    story.append(Spacer(1, 0.8 * cm))

    for s in sections:
        story.append(Paragraph(s["title"], styles["Heading1"]))
        content = s.get("content", "").strip() or "<i>[Section non renseignée]</i>"
        for line in content.split("\n"):
            if line.strip():
                story.append(Paragraph(line.strip(), styles["Normal"]))
        story.append(Spacer(1, 0.5 * cm))

    doc.build(story)
    return dest


def export(sections: list[dict], template_name: str) -> None:
    session_id = uuid.uuid4().hex[:8]
    out_dir = _output_dir()
    filename = _make_filename(session_id)

    docx_path: str | None = None
    pdf_path: str | None = None

    if _DOCX_AVAILABLE:
        _emit({"type": "progress", "status": "docx", "message": "Génération du fichier Word…"})
        try:
            docx_path = str(_export_docx(sections, template_name, out_dir, filename))
        except Exception as e:
            _emit({"type": "error", "message": f"Erreur Word : {e}"})
            return
    else:
        _emit({"type": "warning", "message": "python-docx non disponible — Word ignoré."})

    if _PDF_AVAILABLE:
        _emit({"type": "progress", "status": "pdf", "message": "Génération du PDF…"})
        try:
            pdf_path = str(_export_pdf(sections, template_name, out_dir, filename))
        except Exception as e:
            _emit({"type": "error", "message": f"Erreur PDF : {e}"})
            return
    else:
        _emit({"type": "warning", "message": "reportlab non disponible — PDF ignoré."})

    _emit({
        "type": "complete",
        "docx_path": docx_path,
        "pdf_path": pdf_path,
        "folder_path": str(out_dir),
        "filename": filename,
    })

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
    from docx.shared import Pt, RGBColor, Cm
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
    _DOCX_AVAILABLE = True
except ImportError:
    _DOCX_AVAILABLE = False

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib.colors import HexColor
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.platypus.frames import Frame
    from reportlab.platypus.doctemplate import PageTemplate, BaseDocTemplate
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
    return f"bilan_{datetime.date.today().strftime('%Y%m%d')}_{session_id}"


def _export_docx(
    sections: list[dict],
    template_name: str,
    patient_name: str,
    out_dir: Path,
    filename: str,
    settings: dict,
) -> Path:
    doc = Document()

    # Marges
    for section in doc.sections:
        section.top_margin = Cm(2.5)
        section.bottom_margin = Cm(2.5)
        section.left_margin = Cm(2.5)
        section.right_margin = Cm(2.5)

    therapist_name = settings.get("therapist_name", "")
    therapist_email = settings.get("therapist_email", "")
    therapist_city = settings.get("therapist_city", "")
    date_str = datetime.date.today().strftime("%d/%m/%Y")

    # En-tête : nom et email thérapeute (haut gauche)
    header = doc.sections[0].header
    header.is_linked_to_previous = False
    hp = header.paragraphs[0]
    hp.alignment = WD_ALIGN_PARAGRAPH.LEFT
    if therapist_name:
        run = hp.add_run(therapist_name)
        run.bold = True
        run.font.size = Pt(10)
    if therapist_email:
        hp.add_run(f"\n{therapist_email}").font.size = Pt(9)

    # Titre principal
    title_para = doc.add_paragraph()
    title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_para.paragraph_format.space_before = Pt(12)
    title_run = title_para.add_run(f"Bilan séances Art-thérapie")
    title_run.bold = True
    title_run.font.size = Pt(14)

    if patient_name:
        sub_para = doc.add_paragraph()
        sub_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        sub_run = sub_para.add_run(patient_name)
        sub_run.font.size = Pt(12)
        sub_run.font.color.rgb = RGBColor(0x4F, 0x46, 0xE5)

    doc.add_paragraph()

    # Sections
    for s in sections:
        heading = doc.add_heading(s["title"], level=1)
        heading.runs[0].font.size = Pt(11)
        heading.runs[0].bold = True

        content = s.get("content", "").strip()
        if content:
            for line in content.split("\n"):
                stripped = line.strip()
                if not stripped:
                    continue
                if stripped.startswith(("- ", "* ", "• ")):
                    p = doc.add_paragraph(style="List Bullet")
                    p.add_run(stripped[2:])
                else:
                    doc.add_paragraph(stripped)
        else:
            p = doc.add_paragraph()
            run = p.add_run("[Section non renseignée]")
            run.italic = True
            run.font.color.rgb = RGBColor(0x9C, 0xA3, 0xAF)

        doc.add_paragraph()

    # Pied de page : formule de clôture (bas droite)
    footer = doc.sections[0].footer
    footer.is_linked_to_previous = False
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    footer_text = "Merci de votre confiance"
    if therapist_city:
        footer_text += f", fait à {therapist_city}"
    footer_text += f", le {date_str}."
    if therapist_name:
        footer_text += f"\n{therapist_name}"
    fp.add_run(footer_text).font.size = Pt(9)

    dest = out_dir / f"{filename}.docx"
    doc.save(str(dest))
    return dest


def _export_pdf(
    sections: list[dict],
    template_name: str,
    patient_name: str,
    out_dir: Path,
    filename: str,
    settings: dict,
) -> Path:
    dest = out_dir / f"{filename}.pdf"

    therapist_name = settings.get("therapist_name", "")
    therapist_email = settings.get("therapist_email", "")
    therapist_city = settings.get("therapist_city", "")
    date_str = datetime.date.today().strftime("%d/%m/%Y")

    styles = getSampleStyleSheet()
    indigo = HexColor("#4F46E5")

    title_style = ParagraphStyle(
        "BoldTitle", parent=styles["Title"],
        fontSize=14, spaceAfter=4,
    )
    patient_style = ParagraphStyle(
        "PatientName", parent=styles["Normal"],
        fontSize=12, textColor=indigo, spaceAfter=16, alignment=1,
    )
    h1_style = ParagraphStyle(
        "SectionH1", parent=styles["Heading1"],
        fontSize=11, spaceBefore=14, spaceAfter=4,
    )
    body_style = ParagraphStyle(
        "Body", parent=styles["Normal"],
        fontSize=10, leading=15, spaceAfter=4,
    )
    small_style = ParagraphStyle(
        "Small", parent=styles["Normal"],
        fontSize=8, textColor=HexColor("#9CA3AF"), spaceAfter=2,
    )

    def on_page(canvas, doc):
        canvas.saveState()
        # En-tête haut gauche
        canvas.setFont("Helvetica-Bold", 9)
        canvas.drawString(2.5 * cm, A4[1] - 1.5 * cm, therapist_name)
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(HexColor("#6B7280"))
        canvas.drawString(2.5 * cm, A4[1] - 1.5 * cm - 12, therapist_email)

        # Pied de page bas droite
        footer_line1 = "Merci de votre confiance"
        if therapist_city:
            footer_line1 += f", fait à {therapist_city}, le {date_str}."
        else:
            footer_line1 += f", le {date_str}."
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(HexColor("#374151"))
        canvas.drawRightString(A4[0] - 2.5 * cm, 1.5 * cm, footer_line1)
        if therapist_name:
            canvas.drawRightString(A4[0] - 2.5 * cm, 1.5 * cm - 12, therapist_name)
        canvas.restoreState()

    doc = SimpleDocTemplate(
        str(dest), pagesize=A4,
        rightMargin=2.5 * cm, leftMargin=2.5 * cm,
        topMargin=3 * cm, bottomMargin=3 * cm,
    )

    story = []
    story.append(Paragraph("Bilan séances Art-thérapie", title_style))
    if patient_name:
        story.append(Paragraph(patient_name, patient_style))
    story.append(Spacer(1, 0.4 * cm))

    for s in sections:
        story.append(Paragraph(s["title"], h1_style))
        content = s.get("content", "").strip()
        if content:
            for line in content.split("\n"):
                stripped = line.strip()
                if stripped:
                    story.append(Paragraph(stripped, body_style))
        else:
            story.append(Paragraph("<i>[Section non renseignée]</i>", small_style))
        story.append(Spacer(1, 0.3 * cm))

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    return dest


def export(sections: list[dict], template_name: str, patient_name: str = "") -> None:
    session_id = uuid.uuid4().hex[:8]
    out_dir = _output_dir()
    filename = _make_filename(session_id)
    settings = get_settings()

    docx_path: str | None = None
    pdf_path: str | None = None

    if _DOCX_AVAILABLE:
        _emit({"type": "progress", "status": "docx", "message": "Génération du fichier Word…"})
        try:
            docx_path = str(_export_docx(sections, template_name, patient_name, out_dir, filename, settings))
        except Exception as e:
            _emit({"type": "error", "message": f"Erreur Word : {e}"})
            return
    else:
        _emit({"type": "warning", "message": "python-docx non disponible."})

    if _PDF_AVAILABLE:
        _emit({"type": "progress", "status": "pdf", "message": "Génération du PDF…"})
        try:
            pdf_path = str(_export_pdf(sections, template_name, patient_name, out_dir, filename, settings))
        except Exception as e:
            _emit({"type": "error", "message": f"Erreur PDF : {e}"})
            return
    else:
        _emit({"type": "warning", "message": "reportlab non disponible."})

    _emit({
        "type": "complete",
        "docx_path": docx_path,
        "pdf_path": pdf_path,
        "folder_path": str(out_dir),
        "filename": filename,
    })

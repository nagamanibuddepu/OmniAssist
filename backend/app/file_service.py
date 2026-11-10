import io
import re
import warnings
from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile
from PIL import Image as PILImage
from PIL import UnidentifiedImageError
from pypdf import PdfReader

from .config import settings

MAX_EXTRACTED_CHARS = 80_000
MAX_PDF_PAGES = 100
TEXT_EXTENSIONS = {
    ".txt", ".md", ".py", ".js", ".jsx", ".ts", ".tsx", ".json", ".html",
    ".css", ".sql", ".yaml", ".yml", ".csv", ".sh", ".toml", ".xml", ".log",
    ".r", ".go", ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".php", ".rb",
    ".rs", ".swift", ".kt", ".scala", ".ipynb", ".dockerfile", ".ini", ".conf",
}
IMAGE_MIME_BY_EXT = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}


@dataclass
class ProcessedUpload:
    filename: str
    mime_type: str
    content: bytes
    extracted_text: str


class UploadTooLarge(ValueError):
    pass


def size_limit_label() -> str:
    megabyte = 1024 * 1024
    if settings.max_upload_bytes < megabyte:
        return f"{settings.max_upload_bytes} bytes"
    if settings.max_upload_bytes % megabyte == 0:
        return f"{settings.max_upload_bytes // megabyte} MiB"
    return f"{settings.max_upload_bytes / megabyte:.1f} MiB"


def safe_filename(value: str | None) -> str:
    raw = (value or "upload").replace("\\", "/").split("/")[-1]
    raw = re.sub(r"[\x00-\x1f\x7f]", "", raw).strip().strip(".")
    return (raw or "upload")[:160]


def process_upload(filename: str, content: bytes) -> ProcessedUpload:
    extension = Path(filename.lower()).suffix
    if extension == ".pdf":
        if b"%PDF-" not in content[:1024]:
            raise ValueError("This file does not have a valid PDF signature.")
        try:
            reader = PdfReader(io.BytesIO(content), strict=False)
            if reader.is_encrypted:
                raise ValueError("Password-protected PDFs are not supported.")
            if len(reader.pages) > MAX_PDF_PAGES:
                raise ValueError(f"PDFs are limited to {MAX_PDF_PAGES} pages.")
            extracted = "\n\n".join(page.extract_text() or "" for page in reader.pages).strip()
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError("Could not read this PDF. Check that it is a valid, unencrypted document.") from exc
        if len(extracted) > MAX_EXTRACTED_CHARS:
            extracted = extracted[:MAX_EXTRACTED_CHARS] + "\n[Document text truncated at 80,000 characters.]"
        return ProcessedUpload(filename, "application/pdf", content, extracted)

    if extension in IMAGE_MIME_BY_EXT:
        mime_type = IMAGE_MIME_BY_EXT[extension]
        valid = {
            ".png": content.startswith(b"\x89PNG\r\n\x1a\n"),
            ".jpg": content.startswith(b"\xff\xd8\xff"),
            ".jpeg": content.startswith(b"\xff\xd8\xff"),
            ".webp": content.startswith(b"RIFF") and content[8:12] == b"WEBP",
        }[extension]
        if not valid:
            raise ValueError("The file contents do not match the selected image type.")
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", PILImage.DecompressionBombWarning)
                with PILImage.open(io.BytesIO(content)) as image:
                    if getattr(image, "n_frames", 1) > 1:
                        raise ValueError("Animated images are not supported. Upload a still image instead.")
                    # Optimize large screen captures / presentation slides for fast vision API payload delivery
                    max_dim = 1600
                    if image.width > max_dim or image.height > max_dim or len(content) > 800_000:
                        image.thumbnail((max_dim, max_dim), PILImage.Resampling.LANCZOS)
                        buf = io.BytesIO()
                        save_format = "JPEG" if extension in (".jpg", ".jpeg") else image.format or "PNG"
                        if image.mode in ("RGBA", "P") and save_format == "JPEG":
                            image = image.convert("RGB")
                        image.save(buf, format=save_format, quality=88, optimize=True)
                        content = buf.getvalue()
        except ValueError:
            raise
        except (UnidentifiedImageError, OSError, PILImage.DecompressionBombWarning, PILImage.DecompressionBombError) as exc:
            raise ValueError("This image is invalid or exceeds safe image-processing limits.") from exc
        return ProcessedUpload(filename, mime_type, content, "")

    if extension not in TEXT_EXTENSIONS:
        raise ValueError("Supported uploads are PNG, JPG, JPEG, WebP, PDF, and common text/code files.")
    if b"\x00" in content:
        raise ValueError("This text/code file contains binary data and cannot be processed as text.")
    try:
        extracted = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("Text and code files must use UTF-8 encoding.") from exc
    if len(extracted) > MAX_EXTRACTED_CHARS:
        extracted = extracted[:MAX_EXTRACTED_CHARS] + "\n[File text truncated at 80,000 characters.]"
    mime_type = "text/csv" if extension == ".csv" else "text/plain"
    return ProcessedUpload(filename, mime_type, content, extracted)


def public_file(row) -> dict:
    return {"id": row["id"], "filename": row["filename"], "mime_type": row["mime_type"],
            "size_bytes": row["size_bytes"], "created_at": row["created_at"]}


def read_file_bytes(file_id: str) -> bytes | None:
    path = Path(settings.upload_dir) / f"{file_id}.bin"
    try:
        return path.read_bytes()
    except FileNotFoundError:
        return None


def remove_file(file_id: str) -> None:
    path = Path(settings.upload_dir) / f"{file_id}.bin"
    try:
        path.unlink()
    except FileNotFoundError:
        pass


async def read_bounded_upload(file: UploadFile) -> bytes:
    content = await file.read(settings.max_upload_bytes + 1)
    if len(content) > settings.max_upload_bytes:
        raise UploadTooLarge(f"Files must be {size_limit_label()} or smaller.")
    if not content:
        raise ValueError("The selected file is empty.")
    return content


def write_private_file(file_id: str, content: bytes) -> None:
    directory = Path(settings.upload_dir)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{file_id}.bin"
    with path.open("xb") as handle:
        handle.write(content)

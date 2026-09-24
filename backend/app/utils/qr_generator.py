import qrcode
import io
import base64

def generate_qr_base64(data: str) -> str:
    """
    Generates a QR code encoding `data`, returns it as a base64 PNG string
    that can be sent directly in a JSON response or rendered as an <img> src.
    """
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(data)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    img_bytes = buffer.getvalue()

    return base64.b64encode(img_bytes).decode("utf-8")
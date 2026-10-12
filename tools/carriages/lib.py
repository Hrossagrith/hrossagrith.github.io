"""Helpers for building the carriage drawings from public-domain plates."""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def luminance(im):
    return np.asarray(im.convert('L'), dtype=np.float32)


def background_mask(L, light=228, seeds=None):
    """Background = light pixels connected to the image border (flood fill)."""
    h, w = L.shape
    # Pillow 12 flood-fills RGB images reliably, 'L' images not at all
    light_img = Image.fromarray(((L > light) * 255).astype(np.uint8)).convert('RGB')
    if seeds is None:
        seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),
                 (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]
    for s in seeds:
        if light_img.getpixel(s)[0] == 255:
            ImageDraw.floodfill(light_img, s, (128, 0, 0))
    bg = np.asarray(light_img)[..., 0] == 128
    return bg


def clean_mask(mask, open_px=0, min_area=0):
    """Remove small components (area in pixels) with a simple labelling."""
    m = mask.copy()
    if min_area > 0:
        labels, n = label_components(m)
        if n:
            areas = np.bincount(labels.ravel())
            keep = areas >= min_area
            keep[0] = False
            m = keep[labels]
    return m


def label_components(mask):
    """4-connected component labelling (iterative flood using PIL floodfill)."""
    h, w = mask.shape
    img = Image.fromarray((mask * 255).astype(np.uint8)).convert('RGB')
    labels = np.zeros((h, w), dtype=np.int32)
    n = 0
    arr = np.asarray(img)[..., 0]
    ys, xs = np.nonzero(arr == 255)
    visited = np.zeros((h, w), dtype=bool)
    for y, x in zip(ys, xs):
        if visited[y, x]:
            continue
        n += 1
        tmp = img.copy()
        ImageDraw.floodfill(tmp, (int(x), int(y)), (128, 0, 0))
        comp = np.asarray(tmp)[..., 0] == 128
        labels[comp] = n
        visited |= comp
        if n > 400:
            break
    return labels, n


def largest_component(mask):
    labels, n = label_components(mask)
    if n == 0:
        return mask
    areas = np.bincount(labels.ravel())
    areas[0] = 0
    return labels == int(np.argmax(areas))


def erode(mask, r):
    img = Image.fromarray((mask * 255).astype(np.uint8))
    img = img.filter(ImageFilter.MinFilter(2 * r + 1))
    return np.asarray(img) > 127


def dilate(mask, r):
    img = Image.fromarray((mask * 255).astype(np.uint8))
    img = img.filter(ImageFilter.MaxFilter(2 * r + 1))
    return np.asarray(img) > 127


def polygon_mask(shape, pts):
    img = Image.new('L', (shape[1], shape[0]), 0)
    ImageDraw.Draw(img).polygon([tuple(p) for p in pts], fill=255)
    return np.asarray(img) > 127


def ink_rgba(L, mask, white=232, gamma=1.0, colour=(20, 18, 16)):
    """Black ink whose alpha is the darkness of the plate inside the mask."""
    a = np.clip((white - L) / white, 0, 1) ** gamma
    a = a * mask
    rgba = np.zeros(L.shape + (4,), dtype=np.uint8)
    rgba[..., 0] = colour[0]
    rgba[..., 1] = colour[1]
    rgba[..., 2] = colour[2]
    rgba[..., 3] = (a * 255).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA')


def similarity_fit(src, dst):
    """Least-squares similarity (scale, rotation, translation) mapping src->dst.
    Returns (s, R(2x2), t) with dst = s*R@src + t."""
    src = np.asarray(src, dtype=np.float64)
    dst = np.asarray(dst, dtype=np.float64)
    ms, md = src.mean(0), dst.mean(0)
    a, b = src - ms, dst - md
    H = a.T @ b
    U, S, Vt = np.linalg.svd(H)
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    D = np.diag([1, d])
    R = Vt.T @ D @ U.T
    s = (S * np.diag(D)).sum() / (a ** 2).sum()
    t = md - s * (R @ ms)
    return s, R, t


def apply_sim(pts, s, R, t):
    pts = np.asarray(pts, dtype=np.float64)
    return (s * (R @ pts.T)).T + t


class TPS:
    """Thin-plate spline mapping from control points src -> dst (2-D)."""

    def __init__(self, src, dst, reg=0.0):
        src = np.asarray(src, dtype=np.float64)
        dst = np.asarray(dst, dtype=np.float64)
        n = len(src)
        K = self._kernel(src, src) + reg * np.eye(n)
        P = np.hstack([np.ones((n, 1)), src])
        A = np.zeros((n + 3, n + 3))
        A[:n, :n] = K
        A[:n, n:] = P
        A[n:, :n] = P.T
        B = np.zeros((n + 3, 2))
        B[:n] = dst
        sol = np.linalg.solve(A, B)
        self.src = src
        self.w = sol[:n]
        self.a = sol[n:]

    @staticmethod
    def _kernel(a, b):
        d2 = ((a[:, None, :] - b[None, :, :]) ** 2).sum(-1)
        with np.errstate(divide='ignore', invalid='ignore'):
            k = np.where(d2 > 0, d2 * np.log(d2) * 0.5, 0.0)
        return k

    def __call__(self, pts):
        pts = np.asarray(pts, dtype=np.float64)
        K = self._kernel(pts, self.src)
        return K @ self.w + self.a[0] + pts @ self.a[1:]


def warp_rgba(sprite, mapping, out_size):
    """Inverse-map an RGBA sprite: mapping(dst_pts) -> src_pts; bilinear."""
    W, H = out_size
    arr = np.asarray(sprite, dtype=np.float32)
    h, w = arr.shape[:2]
    ys, xs = np.mgrid[0:H, 0:W]
    dst = np.stack([xs.ravel(), ys.ravel()], 1).astype(np.float64)
    out = np.zeros((H * W, 4), dtype=np.float32)
    chunk = 200000
    for i in range(0, len(dst), chunk):
        src = mapping(dst[i:i + chunk])
        sx, sy = src[:, 0], src[:, 1]
        x0 = np.floor(sx).astype(int)
        y0 = np.floor(sy).astype(int)
        fx = (sx - x0).astype(np.float32)[:, None]
        fy = (sy - y0).astype(np.float32)[:, None]
        valid = (x0 >= 0) & (x0 < w - 1) & (y0 >= 0) & (y0 < h - 1)
        x0c = np.clip(x0, 0, w - 2)
        y0c = np.clip(y0, 0, h - 2)
        p00 = arr[y0c, x0c]
        p10 = arr[y0c, x0c + 1]
        p01 = arr[y0c + 1, x0c]
        p11 = arr[y0c + 1, x0c + 1]
        val = (p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy)
        val[~valid] = 0
        out[i:i + chunk] = val
    return Image.fromarray(out.reshape(H, W, 4).astype(np.uint8), 'RGBA')


def rigid_mapping(s, R, t):
    """Return inverse mapping dst->src for dst = s*R@src + t."""
    Ri = R.T / s

    def f(pts):
        return (Ri @ (np.asarray(pts) - t).T).T
    return f


def catmull_rom(pts, n=200):
    """Smooth open curve through pts (centripetal Catmull-Rom)."""
    pts = np.asarray(pts, dtype=np.float64)
    if len(pts) < 2:
        return pts
    p = np.vstack([pts[0] - (pts[1] - pts[0]), pts, pts[-1] + (pts[-1] - pts[-2])])
    out = []
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        for t in np.linspace(0, 1, n // (len(p) - 3) + 1, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(p[-2])
    return np.array(out)


def chain_from_angles(start, lengths, angles_deg):
    """Polyline from a start point, segment lengths and absolute directions."""
    pts = [np.asarray(start, dtype=np.float64)]
    for L, a in zip(lengths, angles_deg):
        r = np.deg2rad(a)
        pts.append(pts[-1] + L * np.array([np.cos(r), np.sin(r)]))
    return np.array(pts)


def normals(pts):
    pts = np.asarray(pts, dtype=np.float64)
    tang = np.gradient(pts, axis=0)
    tang /= np.linalg.norm(tang, axis=1, keepdims=True) + 1e-9
    return np.stack([-tang[:, 1], tang[:, 0]], 1)

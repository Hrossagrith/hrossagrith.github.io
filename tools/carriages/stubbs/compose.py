"""Compose the six head-carriage drawings from a lateral muscle plate and a
lateral skeleton plate of the same horse. The head (skull and head muscles)
moves rigidly about the atlanto-occipital joint; the neck musculature and the
cervical column are carried together along each carriage's vertebral chain by
a curve-following mesh deformation; the skeleton is laid over the muscles as
a light x-ray layer. Configuration: a JSON file with plate paths, crops,
landmarks and the carriages."""
import json
import math
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import meshwarp

INK = np.array([24, 20, 16], dtype=np.float32)


# ---------------------------------------------------------------- geometry
def affine_from_pairs(src, dst, kind='similarity'):
    src = np.asarray(src, dtype=np.float64)
    dst = np.asarray(dst, dtype=np.float64)
    if kind == 'affine':
        X = np.hstack([src, np.ones((len(src), 1))])
        A, *_ = np.linalg.lstsq(X, dst, rcond=None)
        M = np.eye(3)
        M[:2, :] = A.T
        return M
    ms, md = src.mean(0), dst.mean(0)
    a, b = src - ms, dst - md
    U, Sg, Vt = np.linalg.svd(a.T @ b)
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    D = np.diag([1, d])
    R = Vt.T @ D @ U.T
    s = (Sg * np.diag(D)).sum() / (a ** 2).sum()
    M = np.eye(3)
    M[:2, :2] = s * R
    M[:2, 2] = md - s * (R @ ms)
    return M


def apply(M, pts):
    pts = np.asarray(pts, dtype=np.float64).reshape(-1, 2)
    return (M[:2, :2] @ pts.T).T + M[:2, 2]


def rot(deg):
    r = math.radians(deg)
    return np.array([[math.cos(r), -math.sin(r), 0], [math.sin(r), math.cos(r), 0], [0, 0, 1]])


def trans(dx, dy):
    return np.array([[1, 0, dx], [0, 1, dy], [0, 0, 1]], dtype=np.float64)


def smooth_curve(nodes, n=400):
    """Centripetal Catmull-Rom through the nodes, resampled by arc length."""
    p = np.asarray(nodes, dtype=np.float64)
    ext = np.vstack([2 * p[0] - p[1], p, 2 * p[-1] - p[-2]])
    pts = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for t in np.linspace(0, 1, 40, endpoint=False):
            t2, t3 = t * t, t * t * t
            pts.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    pts.append(p[-1])
    pts = np.array(pts)
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    u = np.linspace(0, s[-1], n)
    out = np.stack([np.interp(u, s, pts[:, 0]), np.interp(u, s, pts[:, 1])], 1)
    return out, u


def frames(curve):
    tang = np.gradient(curve, axis=0)
    tang /= np.linalg.norm(tang, axis=1, keepdims=True) + 1e-12
    nrm = np.stack([-tang[:, 1], tang[:, 0]], 1)
    return tang, nrm


def curvature_radius(curve, u):
    tang, _ = frames(curve)
    ang = np.unwrap(np.arctan2(tang[:, 1], tang[:, 0]))
    k = np.gradient(ang, u)
    k = np.convolve(k, np.ones(15) / 15, mode='same')
    return k  # signed curvature (1/px)


def project(points, curve, u):
    """Arc length and signed normal offset of each point relative to a curve."""
    tang, nrm = frames(curve)
    out_s = np.zeros(len(points))
    out_n = np.zeros(len(points))
    for k, p in enumerate(points):
        d = np.linalg.norm(curve - p, axis=1)
        i = int(np.argmin(d))
        i0, i1 = max(0, i - 1), min(len(curve) - 1, i + 1)
        a, b = curve[i0], curve[i1]
        ab = b - a
        t = np.clip(((p - a) @ ab) / (ab @ ab + 1e-12), 0, 1)
        q = a + t * ab
        s = u[i0] + t * (u[i1] - u[i0])
        # beyond the ends: extrapolate along the end tangents
        if i == 0 and (p - curve[0]) @ tang[0] < 0:
            s = (p - curve[0]) @ tang[0]
            q = curve[0] + s * tang[0]
        if i == len(curve) - 1 and (p - curve[-1]) @ tang[-1] > 0:
            ext = (p - curve[-1]) @ tang[-1]
            s = u[-1] + ext
            q = curve[-1] + ext * tang[-1]
        j = min(max(int(np.searchsorted(u, np.clip(s, 0, u[-1]))), 0), len(curve) - 1)
        out_s[k] = s
        out_n[k] = (p - q) @ nrm[j]
    return out_s, out_n


def evaluate(curve, u, s, n, inner_limit=None):
    tang, nrm = frames(curve)
    sc = np.clip(s, 0, u[-1])
    x = np.interp(sc, u, curve[:, 0])
    y = np.interp(sc, u, curve[:, 1])
    tx = np.interp(sc, u, tang[:, 0])
    ty = np.interp(sc, u, tang[:, 1])
    tl = np.hypot(tx, ty) + 1e-12
    tx, ty = tx / tl, ty / tl
    before = np.minimum(s, 0)
    after = np.maximum(s - u[-1], 0)
    x = x + (before + after) * tx
    y = y + (before + after) * ty
    nx, ny = -ty, tx
    nn = n.copy()
    if inner_limit is not None:
        k = np.interp(sc, u, inner_limit)
        # offsets on the concave side are compressed smoothly below the radius
        concave = (k * n) > 0
        R = np.where(np.abs(k) > 1e-6, 1 / np.maximum(np.abs(k), 1e-6), 1e9)
        lim = 0.85 * R
        comp = lim * np.tanh(np.abs(n) / lim)
        nn = np.where(concave, np.sign(n) * comp, n)
    return np.stack([x + nn * nx, y + nn * ny], 1)


def chain_from_angles(start, lengths, angles):
    pts = [np.asarray(start, dtype=np.float64)]
    for L, a in zip(lengths, angles):
        r = math.radians(a)
        pts.append(pts[-1] + L * np.array([math.cos(r), math.sin(r)]))
    return np.array(pts)


def poly_mask(shape, poly):
    img = Image.new('L', (shape[1], shape[0]), 0)
    ImageDraw.Draw(img).polygon([tuple(map(float, p)) for p in poly], fill=255)
    return np.asarray(img) > 127


def point_in_poly(pts, poly):
    poly = np.asarray(poly, dtype=np.float64)
    x, y = pts[:, 0], pts[:, 1]
    inside = np.zeros(len(pts), dtype=bool)
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        cross = ((yi > y) != (yj > y)) & (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi)
        inside ^= cross
        j = i
    return inside


def dist_to_poly(pts, poly):
    poly = np.asarray(poly, dtype=np.float64)
    best = np.full(len(pts), np.inf)
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        ab = b - a
        t = np.clip(((pts - a) @ ab) / (ab @ ab + 1e-12), 0, 1)
        q = a + t[:, None] * ab
        best = np.minimum(best, np.linalg.norm(pts - q, axis=1))
    return best


# ---------------------------------------------------------------- plates
def load_plate(cfg):
    im = Image.open(cfg['file']).convert('RGB')
    if cfg.get('crop'):
        im = im.crop(tuple(cfg['crop']))
    if cfg.get('mirror'):
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    if cfg.get('scale', 1) != 1:
        im = im.resize((int(im.width * cfg['scale']), int(im.height * cfg['scale'])), Image.LANCZOS)
    return im


def ink_layer(im, paper=None, white=None, gamma=1.0, mask=None):
    """Alpha = darkness relative to the paper tone (estimated from the border)."""
    L = np.asarray(im.convert('L'), dtype=np.float32)
    if white is None:
        border = np.concatenate([L[:8].ravel(), L[-8:].ravel(), L[:, :8].ravel(), L[:, -8:].ravel()])
        white = float(np.percentile(border, 60))
    a = np.clip((white - L) / max(white - 10, 1), 0, 1) ** gamma
    if mask is not None:
        a = a * mask
    return a, white


def figure_mask(im, white, tol=14, seeds=None, erase=()):
    """Figure = everything not connected to the border through paper-tone pixels."""
    L = np.asarray(im.convert('L'), dtype=np.float32).copy()
    for (x0, y0, x1, y1) in erase:
        L[y0:y1, x0:x1] = white
    light = Image.fromarray(((L > white - tol) * 255).astype(np.uint8)).convert('RGB')
    h, w = L.shape
    if seeds is None:
        seeds = [(x, 0) for x in range(0, w, max(1, w // 20))] + [(x, h - 1) for x in range(0, w, max(1, w // 20))] + \
                [(0, y) for y in range(0, h, max(1, h // 20))] + [(w - 1, y) for y in range(0, h, max(1, h // 20))]
    for s in seeds:
        if light.getpixel(s)[0] == 255:
            ImageDraw.floodfill(light, s, (128, 0, 0))
    bg = np.asarray(light)[..., 0] == 128
    fg = ~bg
    img = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    return np.asarray(img) > 127


# ---------------------------------------------------------------- main
def main(cfg_path, out_dir):
    cfg = json.load(open(cfg_path))
    mus = load_plate(cfg['muscles'])
    ske = load_plate(cfg['skeleton'])
    m_alpha, m_white = ink_layer(mus, gamma=cfg['muscles'].get('gamma', 1.0))
    s_alpha, s_white = ink_layer(ske, gamma=cfg['skeleton'].get('gamma', 1.0))
    m_fig = figure_mask(mus, m_white, cfg['muscles'].get('tol', 14), erase=cfg['muscles'].get('erase', []))
    s_fig = figure_mask(ske, s_white, cfg['skeleton'].get('tol', 14), erase=cfg['skeleton'].get('erase', []))
    for (x0, y0, x1, y1) in cfg['muscles'].get('erase', []):
        m_alpha[y0:y1, x0:x1] = 0
    for (x0, y0, x1, y1) in cfg['skeleton'].get('erase', []):
        s_alpha[y0:y1, x0:x1] = 0
    keep = poly_mask(m_alpha.shape, cfg['muscles']['keep'])
    m_alpha *= m_fig & keep
    s_keep = poly_mask(s_alpha.shape, cfg['skeleton']['keep'])
    s_alpha *= s_fig & s_keep

    # skeleton -> muscle plate registration
    pairs = cfg['registration']
    M_sm = affine_from_pairs([p['skeleton'] for p in pairs], [p['muscles'] for p in pairs], cfg.get('registration_kind', 'similarity'))
    res = apply(M_sm, [p['skeleton'] for p in pairs]) - np.array([p['muscles'] for p in pairs], dtype=np.float64)
    print('registration residuals (px):', {p['name']: round(float(np.linalg.norm(r)), 1) for p, r in zip(pairs, res)})
    # skeleton ink and bone mask in muscle-plate coordinates
    Minv = np.linalg.inv(M_sm)
    H0, W0 = m_alpha.shape
    ys, xs = np.mgrid[0:H0, 0:W0]
    src = apply(Minv, np.stack([xs.ravel(), ys.ravel()], 1))
    sk = np.stack([s_alpha, (s_fig & s_keep).astype(np.float32)], -1)
    sk_on = meshwarp._bilinear(sk, src[:, 0], src[:, 1]).reshape(H0, W0, 2)
    valid = ((src[:, 0] >= 0) & (src[:, 0] < sk.shape[1] - 1) & (src[:, 1] >= 0) & (src[:, 1] < sk.shape[0] - 1)).reshape(H0, W0)
    sk_on[~valid] = 0
    bone_alpha, bone_mask = sk_on[..., 0], sk_on[..., 1]
    # x-ray composite: muscles dimmed under the bones, bone lines on top
    xr = cfg.get('xray', {})
    dim = xr.get('muscle_under_bone', 0.3)
    bone_gain = xr.get('bone_gain', 1.0)
    m_under = m_alpha * (1 - (1 - dim) * bone_mask)
    combined = np.clip(m_under + bone_alpha * bone_gain * bone_mask * (1 - m_under * 0.5), 0, 1)
    if xr.get('muscles_only'):
        combined = m_alpha
    # texture: RGB of the ink colour, alpha = combined; plus a coverage channel
    tex = np.zeros((H0, W0, 2), dtype=np.float32)
    tex[..., 0] = combined
    tex[..., 1] = (m_fig & keep).astype(np.float32)
    Image.fromarray((np.clip(1 - combined, 0, 1) * 255).astype(np.uint8)).save(out_dir + '/source-composite.png')

    # landmarks in muscle-plate coordinates
    L = {k: np.array(v, dtype=np.float64) for k, v in cfg['landmarks_skeleton'].items()}
    L = {k: apply(M_sm, [v])[0] for k, v in L.items()}
    chain_src = apply(M_sm, cfg['chain_skeleton'])
    head_poly = np.array(cfg['head_polygon'], dtype=np.float64)
    joint = chain_src[0]
    curve_src, u_src = smooth_curve(chain_src)

    # mesh over the figure
    step = cfg.get('mesh_step', 12)
    ys_f, xs_f = np.nonzero(m_fig & keep)
    x0, x1, y0, y1 = xs_f.min() - step, xs_f.max() + step, ys_f.min() - step, ys_f.max() + step
    verts, tris, _ = meshwarp.grid_mesh(x0, y0, x1, y1, step)
    s_v, n_v = project(verts, curve_src, u_src)
    in_head = point_in_poly(verts, head_poly)
    d_head = dist_to_poly(verts, head_poly)
    blend = cfg.get('head_blend', 70.0)
    w_head = np.where(in_head, 1.0, np.clip(1 - d_head / blend, 0, 1) ** 2)
    face_src = cfg['face_src']
    seg = np.linalg.norm(np.diff(chain_src, axis=0), axis=1)

    sizes, anchors_out, tiles = {}, {}, []
    for pid in cfg['order']:
        pose = cfg['poses'][pid]
        chain_dst = chain_from_angles(joint, seg, pose['chain'])
        curve_dst, u_dst = smooth_curve(chain_dst)
        # keep arc lengths comparable
        u_dst = u_dst * (u_src[-1] / u_dst[-1])
        k_dst = curvature_radius(curve_dst, u_dst)
        neck_pos = evaluate(curve_dst, u_dst, s_v, n_v, inner_limit=k_dst)
        M_head = trans(joint[0], joint[1]) @ rot(pose['face'] - face_src) @ trans(-joint[0], -joint[1])
        # the head turns with the first chain segment as well as with the poll joint
        head_pos = apply(M_head, verts)
        dst = w_head[:, None] * head_pos + (1 - w_head[:, None]) * neck_pos
        # painter's order: neck first (by distance from the head), head last
        cen_w = w_head[tris].mean(1)
        order = np.argsort(cen_w, kind='stable')
        mn = dst.min(0) - 10
        mx = dst.max(0) + 10
        W, H = int(mx[0] - mn[0]), int(mx[1] - mn[1])
        dst_c = dst - mn
        out, cover = meshwarp.warp(tex, verts, dst_c, tris, (W, H), order=order)
        alpha = out[..., 0] * (out[..., 1] > 0.5)
        # fade towards the base of the neck
        s_base = u_src[-1] * cfg.get('base_fade_start', 0.92)
        far = evaluate(curve_dst, u_dst, np.array([s_base, u_src[-1] + 80]), np.array([0.0, 0.0])) - mn
        dirb = far[1] - far[0]
        dirb /= np.linalg.norm(dirb)
        yy, xx = np.mgrid[0:H, 0:W]
        proj = (xx - far[0][0]) * dirb[0] + (yy - far[0][1]) * dirb[1]
        alpha *= np.clip(1 - proj / 90.0, 0, 1)
        rgba = np.zeros((H, W, 4), dtype=np.uint8)
        rgba[..., :3] = INK.astype(np.uint8)
        rgba[..., 3] = (np.clip(alpha, 0, 1) * 255).astype(np.uint8)
        img = Image.fromarray(rgba, 'RGBA')
        bb = img.getbbox()
        img = img.crop((max(0, bb[0] - 6), max(0, bb[1] - 6), min(W, bb[2] + 6), min(H, bb[3] + 6)))
        off = mn - np.array([0, 0]) + np.array([max(0, bb[0] - 6), max(0, bb[1] - 6)])
        img.save('%s/%s.png' % (out_dir, pid), optimize=True)
        sizes[pid] = list(img.size)
        # anchors: rigid head landmarks
        def to_img(p):
            return apply(M_head, [p])[0] - off
        up = L['poll'] - L['bars']
        up /= np.linalg.norm(up)
        side = np.array([-up[1], up[0]])
        if side @ (L['chin'] - L['bars']) < 0:
            side = -side
        anchors = {
            'bit': to_img(L['bars']),
            'poll': to_img(L['poll'] + up * cfg.get('poll_skin', 10)),
            'chin': to_img(L['chin'] + side * cfg.get('chin_skin', 10)),
            'nose': to_img(L['nose'] - side * cfg.get('nose_skin', 12)),
        }
        anchors_out[pid] = {k: [int(round(v[0])), int(round(v[1]))] for k, v in anchors.items()}
        tile = Image.new('RGBA', img.size, (243, 236, 220, 255))
        tile.alpha_composite(img)
        d = ImageDraw.Draw(tile)
        for k, col in [('bit', (200, 0, 0)), ('poll', (0, 120, 0)), ('chin', (0, 0, 200)), ('nose', (200, 120, 0))]:
            x, y = anchors[k]
            d.ellipse((x - 6, y - 6, x + 6, y + 6), outline=col, width=3)
        tiles.append(tile.convert('RGB'))
        print(pid, img.size, anchors_out[pid])
    json.dump({'sizes': sizes, 'anchors': anchors_out}, open(out_dir + '/anchors.json', 'w'), indent=1)
    tw = max(t.width for t in tiles)
    th = max(t.height for t in tiles)
    k = 560 / tw
    sheet = Image.new('RGB', (int(tw * k) * 3 + 40, int(th * k) * 2 + 30), (243, 236, 220))
    for i, t in enumerate(tiles):
        t2 = t.resize((int(t.width * k), int(t.height * k)), Image.LANCZOS)
        sheet.paste(t2, (10 + (i % 3) * (int(tw * k) + 10), 10 + (i // 3) * (int(th * k) + 10)))
    sheet.save(out_dir + '/sheet.png')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])

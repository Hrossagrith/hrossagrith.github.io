"""Head-carriage drawings from George Stubbs, The Anatomy of the Horse (1766):
the first lateral table of the muscles gives the living form of the head and
neck; the first skeleton table gives the skull and the cervical vertebrae,
laid inside the muscled neck as an x-ray layer. The head (skull included)
turns rigidly about the atlanto-occipital joint; the neck muscles and the
vertebrae are carried together along each carriage's vertebral chain."""
import json
import math
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import meshwarp
import compose as C

INK = (24, 20, 16)


def chain_dirs(chain):
    """Directions (deg) of the segments from the base (last point) to the joint."""
    pts = np.asarray(chain, dtype=np.float64)[::-1]
    d = np.diff(pts, axis=0)
    return np.degrees(np.arctan2(d[:, 1], d[:, 0])), np.linalg.norm(d, axis=1)


def chain_from_base(base, lengths, dirs):
    pts = [np.asarray(base, dtype=np.float64)]
    for L, a in zip(lengths, dirs):
        r = math.radians(a)
        pts.append(pts[-1] + L * np.array([math.cos(r), math.sin(r)]))
    return np.array(pts)[::-1]  # joint first


def resample_polyline(pts, n):
    pts = np.asarray(pts, dtype=np.float64)
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    u = np.linspace(0, s[-1], n)
    return np.stack([np.interp(u, s, pts[:, 0]), np.interp(u, s, pts[:, 1])], 1)


def load(cfg):
    mus = Image.open(cfg['muscles']).convert('RGB')
    ske = Image.open(cfg['skeleton']).convert('RGB')
    return mus, ske


def build_source(cfg, out_dir):
    mus, ske = load(cfg)
    cx0, cy0, cx1, cy1 = cfg['crop']
    off = np.array([cx0, cy0], dtype=np.float64)
    mus_c = mus.crop((cx0, cy0, cx1, cy1))
    m_alpha, m_white = C.ink_layer(mus_c)
    m_fig = C.figure_mask(mus_c, m_white, 16)
    seed = (np.array(cfg['landmarks_muscles']['poll']) + np.array([0, 60]) - np.array(cfg['crop'][:2])).astype(int)
    fimg = Image.fromarray((m_fig * 255).astype(np.uint8)).convert('RGB')
    ImageDraw.floodfill(fimg, (int(seed[0]), int(seed[1])), (128, 0, 0))
    m_fig = np.asarray(fimg)[..., 0] == 128
    # fill holes (white highlights inside the horse that touch nothing outside)
    hole = Image.fromarray(((~m_fig) * 255).astype(np.uint8)).convert('RGB')
    ImageDraw.floodfill(hole, (0, 0), (128, 0, 0))
    m_fig = np.asarray(hole)[..., 0] != 128
    m_alpha = m_alpha * m_fig
    H, W = m_alpha.shape
    print('muscle crop', W, H, 'paper', round(m_white, 1))

    # skeleton ink and figure mask (full plate)
    s_alpha, s_white = C.ink_layer(ske)
    s_fig = C.figure_mask(ske, s_white, 16)
    s_alpha = s_alpha * s_fig
    skull_mask = C.poly_mask(s_alpha.shape, cfg['skull_polygon_skeleton'])
    chain_sk = np.array(cfg['chain_skeleton'], dtype=np.float64)
    band = Image.new('L', (s_alpha.shape[1], s_alpha.shape[0]), 0)
    ImageDraw.Draw(band).line([tuple(p) for p in chain_sk], fill=255, width=2 * cfg['chain_band'], joint='curve')
    neck_mask = (np.asarray(band) > 127) & ~skull_mask & s_fig

    # skull: similarity from the skeleton plate to the muscle plate
    pairs = cfg['registration']
    M = C.affine_from_pairs([p['skeleton'] for p in pairs], [p['muscles'] for p in pairs], cfg.get('registration_kind', 'similarity'))
    res = C.apply(M, [p['skeleton'] for p in pairs]) - np.array([p['muscles'] for p in pairs], dtype=np.float64)
    sc = math.sqrt(abs(np.linalg.det(M[:2, :2])))
    ang = math.degrees(math.atan2(M[1, 0], M[0, 0]))
    print('skull registration: scale %.3f rotation %.1f deg; residuals' % (sc, ang), {p['name']: round(float(np.linalg.norm(r)), 1) for p, r in zip(pairs, res)})
    Mc = C.trans(-off[0], -off[1]) @ M
    Minv = np.linalg.inv(Mc)
    ys, xs = np.mgrid[0:H, 0:W]
    src = C.apply(Minv, np.stack([xs.ravel(), ys.ravel()], 1))
    tex_sk = np.stack([s_alpha * skull_mask, skull_mask.astype(np.float32)], -1).astype(np.float32)
    skull_on = meshwarp._bilinear(tex_sk, src[:, 0], src[:, 1]).reshape(H, W, 2)
    inside = ((src[:, 0] >= 0) & (src[:, 0] < tex_sk.shape[1] - 1) & (src[:, 1] >= 0) & (src[:, 1] < tex_sk.shape[0] - 1)).reshape(H, W)
    skull_on[~inside] = 0

    # neck chain in the muscle plate: the joint from the skull registration,
    # vertebrae at fixed fractions of the neck depth between crest and throat
    joint = C.apply(M, [chain_sk[0]])[0]
    crest = resample_polyline(cfg['crest_muscles'], 200)
    under = resample_polyline(cfg['under_muscles'], 200)
    guide = [joint]
    for t, f in zip(cfg['depth_ts'], cfg['depth_fractions']):
        i = int(round(t * 199))
        guide.append(crest[i] + f * (under[i] - crest[i]))
    guide += [np.array(p, dtype=np.float64) for p in cfg['chain_guide_tail']]
    guide_curve, guide_u = C.smooth_curve(np.array(guide), 800)
    # vertebra centres at the skeleton's own spacing (scaled), along the guide
    seg_sk = np.linalg.norm(np.diff(chain_sk, axis=0), axis=1) * sc
    cum = np.concatenate([[0], np.cumsum(seg_sk)])
    if cum[-1] > guide_u[-1]:
        print('warning: guide shorter than the scaled chain: %.0f < %.0f' % (guide_u[-1], cum[-1]))
    chain_m = np.stack([np.interp(cum, guide_u, guide_curve[:, 0]), np.interp(cum, guide_u, guide_curve[:, 1])], 1)
    L_sk = np.linalg.norm(np.diff(chain_sk, axis=0), axis=1).sum()
    L_m = np.linalg.norm(np.diff(chain_m, axis=0), axis=1).sum()
    print('chain length: skeleton %.0f px, muscle plate %.0f px' % (L_sk, L_m))

    # vertebrae: curve-following mesh warp from the skeleton chain to the muscle-plate chain
    curve_sk, u_sk = C.smooth_curve(chain_sk)
    curve_m, u_m = C.smooth_curve(chain_m - off)
    ys_n, xs_n = np.nonzero(neck_mask)
    step = 10
    verts, tris, _ = meshwarp.grid_mesh(xs_n.min() - step, ys_n.min() - step, xs_n.max() + step, ys_n.max() + step, step)
    s_v, n_v2 = C.project(verts, curve_sk, u_sk)
    dst = C.evaluate(curve_m, u_m, s_v * (u_m[-1] / u_sk[-1]), n_v2 * sc)
    tex_nk = np.stack([s_alpha * neck_mask, neck_mask.astype(np.float32)], -1).astype(np.float32)
    neck_on, _ = meshwarp.warp(tex_nk, verts, dst, tris, (W, H))

    bone_alpha = np.maximum(skull_on[..., 0], neck_on[..., 0])
    xr0 = cfg['xray']
    # how much of the muscle shows through: more on the head, less over the vertebrae
    bone_mask = np.clip(np.maximum(skull_on[..., 1] * (1 - xr0['skull_show']), neck_on[..., 1] * (1 - xr0['neck_show'])), 0, 1)
    bone_edge_src = np.clip(np.maximum(skull_on[..., 1], neck_on[..., 1]), 0, 1)
    # bones only where the muscled figure is
    bone_alpha *= m_fig
    bone_mask *= m_fig
    bone_edge_src *= m_fig
    np.save(out_dir + '/src-boneedge.npy', bone_edge_src.astype(np.float32))
    np.save(out_dir + '/src-muscle.npy', m_alpha.astype(np.float32))
    np.save(out_dir + '/src-bone.npy', bone_alpha.astype(np.float32))
    np.save(out_dir + '/src-bonemask.npy', bone_mask.astype(np.float32))
    np.save(out_dir + '/src-fig.npy', m_fig)
    meta = {'off': off.tolist(), 'chain': (chain_m - off).tolist(), 'size': [W, H]}
    json.dump(meta, open(out_dir + '/src-meta.json', 'w'))
    # check image
    xr = cfg['xray']
    comb = composite(m_alpha, bone_alpha, bone_mask, xr)
    img = to_rgba(comb)
    chk = Image.new('RGBA', img.size, (243, 236, 220, 255))
    chk.alpha_composite(img)
    d = ImageDraw.Draw(chk)
    for p in chain_m - off:
        d.ellipse((p[0] - 7, p[1] - 7, p[0] + 7, p[1] + 7), outline=(0, 120, 255), width=3)
    for p in np.array(cfg['crest_muscles']) - off:
        d.rectangle((p[0] - 4, p[1] - 4, p[0] + 4, p[1] + 4), outline=(0, 160, 0), width=2)
    for p in np.array(cfg['under_muscles']) - off:
        d.rectangle((p[0] - 4, p[1] - 4, p[0] + 4, p[1] + 4), outline=(200, 0, 200), width=2)
    for k, p in cfg['landmarks_muscles'].items():
        q = np.array(p) - off
        d.ellipse((q[0] - 8, q[1] - 8, q[0] + 8, q[1] + 8), outline=(220, 0, 0), width=3)
    d.polygon([tuple(p) for p in np.array(cfg['head_polygon_muscles']) - off], outline=(255, 140, 0))
    bl = np.array(cfg['base_line']) - off
    d.line([tuple(bl[0]), tuple(bl[1])], fill=(255, 0, 0), width=3)
    chk.convert('RGB').save(out_dir + '/source-check.png')
    print('source check written')


def composite(m, b, bm, xr):
    m_under = m * (1 - bm)
    return np.clip(m_under + xr.get('bone_gain', 1.0) * b * (1 - 0.5 * m_under), 0, 1)


def to_rgba(alpha):
    H, W = alpha.shape
    rgba = np.zeros((H, W, 4), dtype=np.uint8)
    rgba[..., 0], rgba[..., 1], rgba[..., 2] = INK
    rgba[..., 3] = (np.clip(alpha, 0, 1) * 255).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA')


def render(cfg, out_dir, which):
    meta = json.load(open(out_dir + '/src-meta.json'))
    off = np.array(meta['off'])
    W0, H0 = meta['size']
    m = np.load(out_dir + '/src-muscle.npy')
    b = np.load(out_dir + '/src-bone.npy')
    bm = np.load(out_dir + '/src-bonemask.npy')
    be = np.load(out_dir + '/src-boneedge.npy')
    fig = np.load(out_dir + '/src-fig.npy').astype(np.float32)
    # base fade (towards the body)
    pa, pb = (np.array(cfg['base_line'], dtype=np.float64) - off)
    nb = np.array([-(pb - pa)[1], (pb - pa)[0]])
    nb /= np.linalg.norm(nb)
    chain = np.array(meta['chain'])
    if (chain[0] - pa) @ nb < 0:
        nb = -nb
    yy, xx = np.mgrid[0:H0, 0:W0]
    fade = np.clip(((xx - pa[0]) * nb[0] + (yy - pa[1]) * nb[1]) / 130.0, 0, 1).astype(np.float32)
    keep = fade > 0
    tex = np.stack([m * fade, b * fade, bm * fade, fig * keep, fade, be], -1).astype(np.float32)

    head_poly = np.array(cfg['head_polygon_muscles'], dtype=np.float64) - off
    lm = {k: np.array(v, dtype=np.float64) - off for k, v in cfg['landmarks_muscles'].items()}
    joint = chain[0]
    curve_src, u_src = C.smooth_curve(chain)
    dirs, lens = chain_dirs(chain)
    face_src = math.degrees(math.atan2(*(lm['bit'] - lm['poll'])[::-1]))
    print('source poll-to-bit angle %.1f deg; chain directions from the base' % face_src, np.round(dirs, 1).tolist())

    ys_f, xs_f = np.nonzero(keep & (fig > 0))
    step = 9
    verts, tris, _ = meshwarp.grid_mesh(xs_f.min() - step, ys_f.min() - step, xs_f.max() + step, ys_f.max() + step, step)
    s_v, n_v = C.project(verts, curve_src, u_src)
    in_head = C.point_in_poly(verts, head_poly)
    d_head = C.dist_to_poly(verts, head_poly)
    w_head = np.where(in_head, 1.0, np.clip(1 - d_head / 55.0, 0, 1) ** 2)

    names = which
    results = {}
    tiles = []
    for pid in names:
        pose = cfg['poses'][pid]
        pdirs = np.array(pose['dirs'], dtype=np.float64) if 'dirs' in pose else dirs + pose['rot'] + np.array(pose['bend'])
        chain_d = chain_from_base(chain[-1], lens, pdirs)
        curve_d, u_d = C.smooth_curve(chain_d)
        u_d = u_d * (u_src[-1] / u_d[-1])
        k_d = C.curvature_radius(curve_d, u_d)
        neck_pos = C.evaluate(curve_d, u_d, s_v, n_v, inner_limit=k_d)
        # head: rigid, joint follows the chain, rotation sets the poll-to-bit angle
        target = pose['head'] if pose['head'] is not None else face_src
        Mh = C.trans(chain_d[0][0], chain_d[0][1]) @ C.rot(target - face_src) @ C.trans(-joint[0], -joint[1])
        head_pos = C.apply(Mh, verts)
        dst = w_head[:, None] * head_pos + (1 - w_head[:, None]) * neck_pos
        order = np.argsort(w_head[tris].mean(1), kind='stable')
        mn = dst.min(0) - 10
        mx = dst.max(0) + 10
        W, H = int(mx[0] - mn[0]), int(mx[1] - mn[1])
        out, _ = meshwarp.warp(tex, verts, dst - mn, tris, (W, H), order=order)
        cover = out[..., 3] > 0.5
        alpha = composite(out[..., 0], out[..., 1], np.clip(out[..., 2], 0, 1), cfg['xray']) * cover
        # skin outline: edge of the warped silhouette, faded towards the base
        cimg = Image.fromarray((cover * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
        cov2 = np.asarray(cimg) > 127
        edge = cov2 & ~(np.asarray(cimg.filter(ImageFilter.MinFilter(5))) > 127)
        eimg = Image.fromarray((edge * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
        e = np.asarray(eimg, dtype=np.float32) / 255 * cfg.get('outline', 0.85)
        e *= np.clip((out[..., 4] - 0.35) / 0.5, 0, 1)
        alpha = np.maximum(alpha, e)
        # thin outline round each bone
        bimg = Image.fromarray((np.clip(out[..., 5], 0, 1) > 0.5).astype(np.uint8) * 255)
        bin_ = np.asarray(bimg) > 127
        bedge = bin_ & ~(np.asarray(bimg.filter(ImageFilter.MinFilter(3))) > 127)
        beimg = Image.fromarray((bedge * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
        be_a = np.asarray(beimg, dtype=np.float32) / 255 * cfg['xray'].get('bone_outline', 0.6)
        be_a *= np.clip((out[..., 4] - 0.35) / 0.5, 0, 1)
        alpha = np.maximum(alpha, be_a)
        img = to_rgba(alpha)
        # head flexion relative to the atlas segment
        atlas_dir = math.degrees(math.atan2(*(chain_d[0] - chain_d[1])[::-1]))
        print('%-14s poll-to-bit %5.1f  atlas segment %6.1f  poll angle %6.1f' % (pid, target, atlas_dir, target - atlas_dir))
        # mirror (the site's horse faces left) and scale to one pixel per millimetre
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
        bb = img.getbbox()
        img = img.crop(bb)
        k = cfg['scale_out']
        img = img.resize((int(img.width * k), int(img.height * k)), Image.LANCZOS)
        anchors = {}
        for name, p in lm.items():
            q = C.apply(Mh, [p])[0] - mn
            q = np.array([W - 1 - q[0], q[1]]) - np.array([bb[0], bb[1]])
            anchors[name] = [int(round(q[0] * k)), int(round(q[1] * k))]
        results[pid] = {'size': list(img.size), 'anchors': anchors}
        la = Image.merge('LA', (Image.new('L', img.size, INK[0]), img.split()[3]))
        la.save('%s/%s.png' % (out_dir, pid), optimize=True)
        tile = Image.new('RGBA', img.size, (243, 236, 220, 255))
        tile.alpha_composite(img)
        d = ImageDraw.Draw(tile)
        for name, col in [('bit', (200, 0, 0)), ('poll', (0, 130, 0)), ('chin', (0, 0, 200)), ('nose', (200, 120, 0))]:
            x, y = anchors[name]
            d.ellipse((x - 5, y - 5, x + 5, y + 5), outline=col, width=2)
        d.text((6, 4), pid, fill=(120, 0, 0))
        tiles.append(tile.convert('RGB'))
    json.dump(results, open(out_dir + '/anchors.json', 'w'), indent=1)
    tw = max(t.width for t in tiles)
    th = max(t.height for t in tiles)
    cols = 3 if len(tiles) > 2 else len(tiles)
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (tw * cols + 10 * (cols + 1), th * rows + 10 * (rows + 1)), (243, 236, 220))
    for i, t in enumerate(tiles):
        sheet.paste(t, (10 + (i % cols) * (tw + 10), 10 + (i // cols) * (th + 10)))
    sheet.save(out_dir + '/sheet.png')
    return results


if __name__ == '__main__':
    cfg = json.load(open(sys.argv[1]))
    out_dir = sys.argv[2]
    mode = sys.argv[3] if len(sys.argv) > 3 else 'all'
    if mode in ('source', 'all'):
        build_source(cfg, out_dir)
    if mode in ('render', 'all'):
        which = sys.argv[4].split(',') if len(sys.argv) > 4 else cfg['order']
        render(cfg, out_dir, which)

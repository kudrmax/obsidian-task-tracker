# python3 scripts/design-catalog/diff.py <dirA> <dirB>
# For every shot in both folders: "same", or how many pixels differ and the box around them. Decodes with ffmpeg.
import os
import subprocess
import sys


def pixels(path):
    size = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", path])
    width, height = map(int, size.decode().strip().split(","))
    data = subprocess.check_output(["ffmpeg", "-v", "error", "-i", path, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"])
    return width, height, data


def compare(a, b):
    wa, ha, A = pixels(a)
    wb, hb, B = pixels(b)
    if (wa, ha) != (wb, hb):
        return f"size {wa}x{ha} vs {wb}x{hb}"
    if A == B:
        return "same"
    stride = wa * 3
    count, x0, y0, x1, y1 = 0, wa, ha, -1, -1
    for y in range(ha):
        ra, rb = A[y * stride:(y + 1) * stride], B[y * stride:(y + 1) * stride]
        if ra == rb:
            continue
        for x in range(wa):
            if ra[x * 3:x * 3 + 3] != rb[x * 3:x * 3 + 3]:
                count += 1
                x0, x1, y0, y1 = min(x0, x), max(x1, x), min(y0, y), max(y1, y)
    return f"diff {count} box ({x0},{y0})-({x1},{y1})"


def main():
    a, b = sys.argv[1], sys.argv[2]
    differ = 0
    for name in sorted(os.listdir(a)):
        if name.endswith(".png") and os.path.exists(os.path.join(b, name)):
            result = compare(os.path.join(a, name), os.path.join(b, name))
            differ += result != "same"
            print(name, result)
    print(f"{differ} differ")


main()

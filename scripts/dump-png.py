#!/usr/bin/env python3
"""Decode PNG to raw RGBA and write to /tmp for Node.js jsQR test."""
import zlib, struct, json

def decode_png(path):
    with open(path, 'rb') as f:
        data = f.read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', "Not a PNG"
    pos = 8
    idat = b''
    w = h = bit_depth = color_type = 0
    while pos < len(data):
        length = struct.unpack('>I', data[pos:pos+4])[0]
        ctype = data[pos+4:pos+8]
        cdata = data[pos+8:pos+8+length]
        if ctype == b'IHDR':
            w, h = struct.unpack('>II', cdata[:8])
            bit_depth, color_type = cdata[8], cdata[9]
        elif ctype == b'IDAT':
            idat += cdata
        elif ctype == b'IEND':
            break
        pos += 12 + length

    raw = zlib.decompress(idat)
    # color_type 6 = RGBA, 2 = RGB
    channels = 4 if color_type == 6 else 3
    stride = w * channels
    rgba = bytearray(w * h * 4)
    idx = 0
    row_pos = 0
    for row in range(h):
        filter_byte = raw[row_pos]
        row_data = bytearray(raw[row_pos+1:row_pos+1+stride])
        row_pos += 1 + stride
        # Apply filter
        if filter_byte == 1:  # Sub
            for i in range(channels, len(row_data)):
                row_data[i] = (row_data[i] + row_data[i-channels]) & 0xFF
        elif filter_byte == 2:  # Up
            if row > 0:
                prev_start = (row-1) * stride
                prev = bytearray(raw[prev_start+1:prev_start+1+stride])
                for i in range(len(row_data)):
                    row_data[i] = (row_data[i] + prev[i]) & 0xFF
        elif filter_byte == 4:  # Paeth
            prev_row = bytearray(raw[(row-1)*(stride+1)+1:(row-1)*(stride+1)+1+stride]) if row > 0 else bytearray(stride)
            for i in range(len(row_data)):
                a = row_data[i-channels] if i >= channels else 0
                b = prev_row[i]
                c = prev_row[i-channels] if i >= channels else 0
                pa, pb, pc = abs(b-c), abs(a-c), abs(a+b-2*c)
                pr = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                row_data[i] = (row_data[i] + pr) & 0xFF
        # Write to RGBA buffer
        for x in range(w):
            rgba[idx]   = row_data[x*channels]
            rgba[idx+1] = row_data[x*channels+1]
            rgba[idx+2] = row_data[x*channels+2]
            rgba[idx+3] = row_data[x*channels+3] if channels == 4 else 255
            idx += 4
    return w, h, bytes(rgba)

path = '/Users/gongyi01/.claude/image-cache/17d4f02c-be57-4e2d-8dc1-9871aa314538/1.png'
w, h, rgba = decode_png(path)
print(f"Decoded: {w}x{h}, {len(rgba)} bytes RGBA")
with open('/tmp/qr_test_rgba.bin', 'wb') as f:
    f.write(rgba)
with open('/tmp/qr_test_meta.json', 'w') as f:
    json.dump({'width': w, 'height': h}, f)
print("Written to /tmp/qr_test_rgba.bin and /tmp/qr_test_meta.json")

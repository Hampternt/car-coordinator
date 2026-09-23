"""Regenerates the awkward-shape fixtures in scripts/fixtures/edge/.

These are not real exports. Each one is a shape the warehouse could plausibly
hand the app one morning — a third bakery, a canteen with a very long name, an
order with more lines than a sheet holds — and each one used to break the
printed page in a way nothing told anyone about. scripts/breadify.mjs drives
every one of them and asserts that no ink leaves the paper.

    python3 scripts/make_edge_fixtures.py

The writer below is deliberately minimal: inline strings, one sheet, and
column O carrying the region with no header, exactly as the real export does.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import zipfile, html

HEADERS = ["Order ID","Quantity","Product ID","Product Name","Supplier SKU","Position",
           "Supplier","Customer","Department","Delivery street","Comment",
           "Route nickname","Route ordering","Accept alternatives"]

def col_ref(i):
    s, i = "", i + 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s

def cell(ref, value):
    if value is None or value == "":
        return ""
    if isinstance(value, bool):
        return f'<c r="{ref}" t="b"><v>{1 if value else 0}</v></c>'
    if isinstance(value, (int, float)):
        return f'<c r="{ref}" t="n"><v>{value}</v></c>'
    return f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{html.escape(str(value))}</t></is></c>'

def sheet_xml(rows):
    out = []
    for n, values in enumerate(rows, start=1):
        cells = "".join(cell(f"{col_ref(i)}{n}", v) for i, v in enumerate(values))
        out.append(f'<row r="{n}">{cells}</row>')
    body = "".join(out)
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            f'<sheetData>{body}</sheetData></worksheet>')

def write(path, data_rows, sheet_name="Data", headers=None, trailing_col=True):
    """data_rows: list of dicts with the 14 named fields plus 'region'."""
    hdr = list(HEADERS if headers is None else headers)
    rows = [hdr]                                   # O1 left absent = no header
    for r in data_rows:
        row = [r.get("orderId"), r.get("quantity"), r.get("productId"), r.get("productName"),
               r.get("supplierSku"), r.get("position"), r.get("supplier"), r.get("customer"),
               r.get("department"), r.get("deliveryStreet"), r.get("comment"),
               r.get("routeNickname"), r.get("routeOrdering"), r.get("acceptAlternatives")]
        if trailing_col:
            row.append(r.get("region", "Stavanger"))
        rows.append(row)

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            '</Types>')
        z.writestr("_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            '</Relationships>')
        z.writestr("xl/workbook.xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f'<sheets><sheet name="{html.escape(sheet_name)}" sheetId="1" r:id="rId1"/></sheets></workbook>')
        z.writestr("xl/_rels/workbook.xml.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            '</Relationships>')
        z.writestr("xl/worksheets/sheet1.xml", sheet_xml(rows))



OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'edge')
os.makedirs(OUT, exist_ok=True)

def line(order, seq, route, cust, prod, qty, sup, pid, dept=None, street=None):
    return dict(orderId=order, quantity=qty, productId=pid, productName=prod,
                supplierSku=str(pid), position=str(seq or ''), supplier=sup,
                customer=cust, department=dept,
                deliveryStreet=street or f'Street {order % 90:02d}',
                routeNickname=route, routeOrdering=seq, acceptAlternatives=True)

S = {}

# ── A. suppliers ───────────────────────────────────────────────────────────
def suppliers_case(n):
    names = ['Sandnes Bakeri', 'Bakehuset'] + [f'Wholesaler {chr(67+i)}' for i in range(n - 2)]
    rows = []
    for s in range(6):                       # 6 stops on one route
        for i, sup in enumerate(names):
            rows.append(line(1000 + s, (s + 1) * 100, '1', f'Customer {s:03d}',
                             f'{sup} Loaf {i}', 4 + i, sup, 100 + i))
    return rows
S['suppliers-03'] = suppliers_case(3)
S['suppliers-06'] = suppliers_case(6)
S['suppliers-12'] = suppliers_case(12)

# Two different bakeries whose derived two-letter codes are identical.
S['supplier-code-collision'] = [
    line(1, 100, '1', 'Customer 001', 'Rundstykke', 10, 'Stavanger Bakeri', 201),
    line(1, 100, '1', 'Customer 001', 'Grovbrød',   10, 'Sola Bakeri',      202),
    line(1, 100, '1', 'Customer 001', 'Loff',       10, 'Sandnes Bakeri',   203),
]
S['supplier-empty'] = [line(1, 100, '1', 'Customer 001', 'Rundstykke', 10, '', 301)]

# ── B. volume ──────────────────────────────────────────────────────────────
# One stop with far more lines than a page can hold.
S['one-giant-stop'] = [
    line(1, 100, '1', 'Customer 001', f'Bread variety number {i:03d}', 3,
         'Sandnes Bakeri', 400 + i) for i in range(300)
]
# Many stops on one route.
S['200-stops'] = [
    line(2000 + s, (s + 1) * 10, '1', f'Customer {s:03d}', 'Rundstykke', 5,
         'Sandnes Bakeri', 500) for s in range(200)
]
# A whole warehouse-sized day.
big = []
for r in range(40):
    for s in range(40):
        for l in range(6):
            big.append(line(r * 1000 + s, (s + 1) * 10, str(r + 1), f'Customer {s:03d}',
                            f'Product {l}', 3, 'Sandnes Bakeri' if l % 2 else 'Bakehuset', 600 + l))
S['9600-rows'] = big

# Quantities far past anything a bakery would send.
S['huge-quantities'] = [
    line(1, 100, '1', 'Customer 001', 'Rundstykke', 999999, 'Sandnes Bakeri', 700),
    line(2, 200, '1', 'Customer 002', 'Grovbrød', 250, 'Sandnes Bakeri', 701),
]

# ── C. long text ───────────────────────────────────────────────────────────
LONG = 'Ekstraordinært Langtnavngitt Storkjøkken og Kantinedrift Avdeling Nord'
S['long-customer'] = [line(1, 100, '1', LONG * 3, 'Rundstykke', 10, 'Sandnes Bakeri', 800)]
S['long-product'] = [
    line(1, 100, '1', 'Customer 001',
         'Grovbrød med solsikkekjerner og gresskarkjerner ' * 6, 10, 'Sandnes Bakeri', 801)]
S['long-department'] = [
    line(1, 100, '1', 'Customer 001', 'Rundstykke', 10, 'Sandnes Bakeri', 802,
         dept='Avdeling for storhusholdning og institusjonskjøkken ' * 3)]
S['long-route-name'] = [
    line(1, 100, 'Langdistanse nordover via Randaberg og Tananger rute 7',
         'Customer 001', 'Rundstykke', 10, 'Sandnes Bakeri', 803)]
S['long-supplier'] = [
    line(1, 100, '1', 'Customer 001', 'Rundstykke', 10,
         'Det Store Sandnes og Jæren Håndverksbakeri og Konditori AS', 804)]

# ── D. structural ──────────────────────────────────────────────────────────
# Order ID blank on every row: integer() makes them all 0, so they fold as one.
S['no-order-id'] = [
    dict(line(0, (s + 1) * 100, '1', f'Customer {s:03d}', 'Rundstykke', 5,
              'Sandnes Bakeri', 900), orderId=None) for s in range(5)
]
# One product id, two different names.
S['product-id-clash'] = [
    line(1, 100, '1', 'Customer 001', 'Rundstykke', 10, 'Sandnes Bakeri', 950),
    line(2, 200, '1', 'Customer 002', 'Grovbrød',   10, 'Sandnes Bakeri', 950),
]


KEEP = {'suppliers-12','one-giant-stop','long-customer','long-department',
        'long-route-name','long-supplier','supplier-code-collision','200-stops'}
for name, rows in S.items():
    if name not in KEEP:
        continue
    path = os.path.join(OUT, f'PSR-BREAD-2026-03-04-to-2026-03-04-{name}.xlsx')
    write(path, rows)
    print(f'{name:26s} {len(rows):6d} rows  {os.path.getsize(path)//1024:6d} KB')

# A school kitchen's morning: the biggest order a real route carries. 400 of
# one bread is a big day and must print without comment; the four-figure line
# below is a decimal point in the wrong place and must not.
SB, BH = 'Sandnes Bakeri', 'Bakehuset'
BIG = [('Rundstykke', 400, SB), ('Grovbrød 750g', 250, SB), ('Kneippbrød', 180, SB),
       ('Loff Oppskåret', 120, SB), ('Baguette', 96, BH), ('Rugbrød 12biter', 60, BH),
       ('Horn', 48, BH)]
busy = [line(5001, 100, '7', 'Storkjøkken Nord', p, q, s, 300 + i, dept='Hovedkjøkken')
        for i, (p, q, s) in enumerate(BIG)]
for stop in range(4):
    for i, (p, q, s) in enumerate([('Rundstykke', 40, SB), ('Grovbrød 750g', 24, SB),
                                   ('Baguette', 12, BH)]):
        busy.append(line(5010 + stop, (stop + 2) * 100, '7', f'Kafé {stop + 1:02d}', p, q, s, 300 + i))

for name, rows in [('busy-real-day', busy),
                   ('four-figure-line', [line(1, 100, '7', 'Storkjøkken Nord', 'Rundstykke',
                                              4000, SB, 300)])]:
    path = os.path.join(OUT, f'PSR-BREAD-2026-03-04-to-2026-03-04-{name}.xlsx')
    write(path, rows)
    print(f'{name:26s} {len(rows):6d} rows  {os.path.getsize(path)//1024:6d} KB')


# ── More bakeries than the page was drawn for ──────────────────────────────
#
# The bread total was designed around two. Three or four is the change the
# warehouse might actually make one day, so these are real-shaped: plausible
# Norwegian bakery names, plausible breads, and enough stops to give the
# total something to add up.

BAKERS = [
    ('Sandnes Bakeri', [('Rundstykke', 60), ('Grovbrød 750g', 48),
                        ('Kneippbrød', 36), ('Loff Oppskåret', 24)]),
    ('Bakehuset', [('Baguette', 40), ('Rugbrød 12biter', 30), ('Horn', 18)]),
    ('Jæren Bakeri', [('Speltbrød 500g', 28), ('Solsikkebrød', 22), ('Byggbrød', 14)]),
    ('Stavanger Steinovnsbakeri', [('Surdeigsbrød 1kg', 20), ('Focaccia', 16)]),
    ('Ålgård Konditori', [('Skolebolle', 26), ('Wienerbrød', 12)]),
]

for many in (3, 4, 5):
    rows = []
    for stop in range(3):
        for supplier, breads in BAKERS[:many]:
            for product, quantity in breads:
                rows.append(line(6000 + stop, (stop + 1) * 100, '3', f'Kafé {stop + 1:02d}',
                                 product, max(4, quantity // (stop + 2)), supplier,
                                 400 + abs(hash((supplier, product))) % 900))
    path = os.path.join(OUT, f'PSR-BREAD-2026-03-04-to-2026-03-04-bakeries-{many}.xlsx')
    write(path, rows)
    print(f'bakeries-{many}{"":18s}{len(rows):6d} rows  {os.path.getsize(path)//1024:6d} KB')

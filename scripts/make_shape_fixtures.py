"""Regenerates the shape fixtures in scripts/fixtures/shape/.

The export's format is unlikely to change — which is exactly why it is worth
knowing what happens if it does. Each of these is one change to the file's own
shape (a column added, a header renamed, the sheet renamed, data starting a row
late) or one number at the edge of what a spreadsheet can hold (zero, negative,
fractional, past the largest integer a double carries exactly).

The rule scripts/breadify.mjs asserts against them is simple: a change to the
shape is either REFUSED with a message naming the problem, or read correctly.
It is never printed wrong, and it never throws.

    python3 scripts/make_shape_fixtures.py
"""
import os, zipfile, html

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'shape')
os.makedirs(OUT, exist_ok=True)

H = ["Order ID","Quantity","Product ID","Product Name","Supplier SKU","Position","Supplier",
     "Customer","Department","Delivery street","Comment","Route nickname","Route ordering",
     "Accept alternatives"]

def cref(i):
    s,i="",i+1
    while i:
        i,r=divmod(i-1,26); s=chr(65+r)+s
    return s

def cell(ref, v, raw=None):
    if raw is not None: return f'<c r="{ref}"{raw}'
    if v is None or v=="": return ""
    if isinstance(v,bool): return f'<c r="{ref}" t="b"><v>{1 if v else 0}</v></c>'
    if isinstance(v,(int,float)): return f'<c r="{ref}" t="n"><v>{v}</v></c>'
    return f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{html.escape(str(v))}</t></is></c>'

def write(path, rows, sheet_name="Data", start_row=1, raw_rows=None):
    out=[]
    n=start_row
    for values in rows:
        if values is None:            # a genuinely blank row
            n+=1; continue
        cells="".join(cell(f"{cref(i)}{n}", v) for i,v in enumerate(values))
        out.append(f'<row r="{n}">{cells}</row>'); n+=1
    if raw_rows: out.append(raw_rows)
    sheet=('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      f'<sheetData>{"".join(out)}</sheetData></worksheet>')
    with zipfile.ZipFile(path,"w",zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
        z.writestr("_rels/.rels",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        z.writestr("xl/workbook.xml",f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="{html.escape(sheet_name)}" sheetId="1" r:id="rId1"/></sheets></workbook>')
        z.writestr("xl/_rels/workbook.xml.rels",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
        z.writestr("xl/worksheets/sheet1.xml", sheet)

def body(qty=10, pid=100, sup="Sandnes Bakeri", cust="Customer 001", prod="Rundstykke",
         oid=1, seq=100, route="1", dept=None, region="Stavanger", sku="A1"):
    return [oid,qty,pid,prod,sku,"1",sup,cust,dept,"Street 01",None,route,seq,True,region]

C={}
C['baseline']              = ([H, body()], {})
C['extra-16th-column']     = ([H+[None], body()+["extra"]], {})
C['header-on-column-O']    = ([H+["Region"], body()], {})
C['header-renamed']        = ([[*H[:7],"Customer name",*H[8:]], body()], {})
C['columns-reordered']     = ([[H[1],H[0],*H[2:]], body()], {})
C['sheet-renamed']         = ([H, body()], {'sheet_name':'Sheet1'})
C['starts-at-row-2']       = ([H, body()], {'start_row':2})
C['blank-row-midway']      = ([H, body(oid=1), None, body(oid=2,cust="Customer 002")], {})
C['one-column-short']      = ([H, body()[:14]], {})
C['header-only-no-data']   = ([H+[None]], {})
# numbers where text is expected, and text where numbers are
C['quantity-as-text']      = ([H, body(qty="10")], {})
C['quantity-zero']         = ([H, body(qty=0)], {})
C['quantity-negative']     = ([H, body(qty=-5)], {})
C['quantity-fractional']   = ([H, body(qty=2.5)], {})
C['quantity-2-billion']    = ([H, body(qty=2147483648)], {})
C['quantity-beyond-float'] = ([H, body(qty=9007199254740993)], {})
C['order-id-huge']         = ([H, body(oid=9007199254740993)], {})
C['product-id-zero']       = ([H, body(pid=0)], {})
C['sequence-negative']     = ([H, body(seq=-1)], {})
C['unicode-everywhere']    = ([H, body(cust="Kafé Ærlig 🥖 Ø-gården", prod="Grovbrød 😀 ½kg",
                                       sup="Bäckerei Größe", route="rute é1")], {})
C['whitespace-padded']     = ([H, body(cust="  Customer 001  ", sup="  Sandnes Bakeri  ",
                                       route=" 1 ")], {})
# a real Excel quirk: a formula cell caches its value with t="str"
C['formula-cell']          = ([H, body()], {'raw_rows':
    '<row r="3"><c r="A3" t="n"><v>2</v></c><c r="B3" t="str"><f>5*2</f><v>10</v></c>'
    '<c r="C3" t="n"><v>100</v></c><c r="D3" t="inlineStr"><is><t>Rundstykke</t></is></c>'
    '<c r="E3" t="inlineStr"><is><t>A1</t></is></c><c r="G3" t="inlineStr"><is><t>Sandnes Bakeri</t></is></c>'
    '<c r="H3" t="inlineStr"><is><t>Customer 002</t></is></c><c r="J3" t="inlineStr"><is><t>Street 02</t></is></c>'
    '<c r="L3" t="inlineStr"><is><t>1</t></is></c><c r="M3" t="n"><v>200</v></c>'
    '<c r="N3" t="b"><v>1</v></c><c r="O3" t="inlineStr"><is><t>Stavanger</t></is></c></row>'})
# an error value where a number should be
C['error-cell']            = ([H, body()], {'raw_rows':
    '<row r="3"><c r="A3" t="n"><v>2</v></c><c r="B3" t="e"><v>#DIV/0!</v></c>'
    '<c r="C3" t="n"><v>100</v></c><c r="D3" t="inlineStr"><is><t>Rundstykke</t></is></c>'
    '<c r="G3" t="inlineStr"><is><t>Sandnes Bakeri</t></is></c>'
    '<c r="H3" t="inlineStr"><is><t>Customer 003</t></is></c><c r="J3" t="inlineStr"><is><t>Street 03</t></is></c>'
    '<c r="L3" t="inlineStr"><is><t>1</t></is></c><c r="M3" t="n"><v>300</v></c>'
    '<c r="N3" t="b"><v>1</v></c><c r="O3" t="inlineStr"><is><t>Stavanger</t></is></c></row>'})

for name, (rows, opts) in C.items():
    write(os.path.join(OUT, f'PSR-BREAD-2026-03-04-to-2026-03-04-{name}.xlsx'), rows, **opts)
print(f'{len(C)} shape fixtures in {OUT}')

# import fitz
# import difflib


# def extract_paragraphs(pdf_path):
#     doc = fitz.open(pdf_path)
#     paragraphs = []
#     for page in doc:
#         blocks = page.get_text('blocks')
#         for b in blocks:
#             text = b[4].strip()
#             if len(text) > 20:
#                 paragraphs.append(text)
#     return paragraphs


# def compare_pdfs(old_path, new_path):
#     old_text = extract_paragraphs(old_path)
#     new_text = extract_paragraphs(new_path)

#     # SequenceMatcher
#     sm = difflib.SequenceMatcher(None, old_text, new_text)
#     changes = []
#     for tag, i1, i2, j1, j2 in sm.get_opcodes():
#         if tag == 'replace':
#             changes.append(
#                 {
#                     "type": "modified",
#                     "old_content": "\n".join(old_text[i1:i2]),
#                     "new_content": "\n".join(new_text[j1:j2])
#                 }
#             )
#         elif tag == 'insert':
#             changes.append({
#                 "type": "added",
#                 "content": "\n".join(new_text[j1:j2])
#             })
#         elif tag =='delete':
#             changes.append({
#                 "type": "removed",
#                 "content": "\n".join(old_text[i1:i2])
#             })
#     return changes


# old_path = "./1_Baseline_Docs/NY_Gaming_Baseline.pdf"
# new_path = "./2_Simulated_Changes/NY_Gaming_Baseline.pdf"
# diff_data =compare_pdfs(old_path=old_path, new_path=new_path)

# print(diff_data)


# ========


# import fitz  # PyMuPDF
# import difflib
# import streamlit as st

# def get_detailed_text(pdf_path):
#     doc = fitz.open(pdf_path)
#     content = []
#     for page_num, page in enumerate(doc):
#         # "dict" gives us spans, colors, fonts, and exact coordinates
#         blocks = page.get_text("dict")["blocks"]
#         for b in blocks:
#             if "lines" in b:
#                 for l in b["lines"]:
#                     for s in l["spans"]:
#                         content.append({
#                             "text": s["text"],
#                             "font": s["font"],
#                             "size": s["size"],
#                             "color": s["color"],
#                             "page": page_num + 1,
#                             "bbox": s["bbox"]  # (x0, y0, x1, y1)
#                         })
#     return content

# def find_precise_diffs(old_pdf, new_pdf):
#     old_data = get_detailed_text(old_pdf)
#     new_data = get_detailed_text(new_pdf)
    
#     # Flatten text for char-by-char diffing
#     old_str = "".join([d["text"] for d in old_data])
#     new_str = "".join([d["text"] for d in new_data])
    
#     # ndiff tracks every space, typo, and character
#     diff = list(difflib.ndiff(old_str, new_str))
    
#     return diff, old_data, new_data


# old_path = "./1_Baseline_Docs/NY_Gaming_Baseline.pdf"
# new_path = "./2_Simulated_Changes/NY_Gaming_Baseline.pdf"
# diff, old_data, new_data =find_precise_diffs(old_path, new_path)
# print(diff)


# ===== working


# import fitz  # PyMuPDF
# import difflib
# import sqlite3
# import os

# DB_NAME = "pdf_audit.db"

# def init_db():
#     conn = sqlite3.connect(DB_NAME)
#     c = conn.cursor()
#     # Stores every detected change with its location and style metadata
#     c.execute('''CREATE TABLE IF NOT EXISTS diff_results (
#                  id INTEGER PRIMARY KEY AUTOINCREMENT,
#                  file_name TEXT,
#                  page_num INTEGER,
#                  change_type TEXT, 
#                  old_val TEXT,
#                  new_val TEXT,
#                  style_info TEXT,
#                  status TEXT DEFAULT 'Pending')''')
#     conn.commit()
#     conn.close()

# def extract_detailed_spans(pdf_path):
#     """Extracts text, coordinates, and styling for every span in the PDF."""
#     doc = fitz.open(pdf_path)
#     data = []
#     for page_num, page in enumerate(doc):
#         blocks = page.get_text("dict")["blocks"]
#         for b in blocks:
#             if "lines" in b:
#                 for l in b["lines"]:
#                     for s in l["spans"]:
#                         data.append({
#                             "text": s["text"],
#                             "font": s["font"],
#                             "size": round(s["size"], 1),
#                             "page": page_num + 1,
#                             "style": f"{s['font']} ({round(s['size'], 1)}pt)"
#                         })
#     return data

# def run_comparison(old_path, new_path):
#     file_name = os.path.basename(new_path)
#     old_data = extract_detailed_spans(old_path)
#     new_data = extract_detailed_spans(new_path)

#     # Convert to list of strings for diffing
#     old_texts = [d["text"] for d in old_data]
#     new_texts = [d["text"] for d in new_data]

#     diff = difflib.SequenceMatcher(None, old_texts, new_texts)
#     conn = sqlite3.connect(DB_NAME)
#     c = conn.cursor()

#     for tag, i1, i2, j1, j2 in diff.get_opcodes():
#         if tag == 'equal':
#             # Check for style-only changes in "equal" text
#             for idx_old, idx_new in zip(range(i1, i2), range(j1, j2)):
#                 if old_data[idx_old]["style"] != new_data[idx_new]["style"]:
#                     c.execute("INSERT INTO diff_results (file_name, page_num, change_type, old_val, new_val, style_info) VALUES (?, ?, ?, ?, ?, ?)",
#                               (file_name, old_data[idx_old]["page"], "Style Change", 
#                                old_data[idx_old]["text"], new_data[idx_new]["text"], 
#                                f"Changed from {old_data[idx_old]['style']} to {new_data[idx_new]['style']}"))
        
#         elif tag in ('replace', 'delete', 'insert'):
#             change_type = "Content Change"
#             old_val = " ".join(old_texts[i1:i2]) if tag in ('replace', 'delete') else ""
#             new_val = " ".join(new_texts[j1:j2]) if tag in ('replace', 'insert') else ""
#             page = old_data[i1]["page"] if i1 < len(old_data) else new_data[j1]["page"]
            
#             c.execute("INSERT INTO diff_results (file_name, page_num, change_type, old_val, new_val, style_info) VALUES (?, ?, ?, ?, ?, ?)",
#                       (file_name, page, tag.capitalize(), old_val, new_val, "Manual Review Required"))

#     conn.commit()
#     conn.close()


# old_path = "./1_Baseline_Docs/NY_Gaming_Baseline.pdf"
# new_path = "./2_Simulated_Changes/NY_Gaming_Baseline.pdf"
# init_db()
# run_comparison(old_path, new_path)
# print("completed")



# ====== working image bbox

# import fitz
# import difflib

# def get_page_diffs(old_pdf_path, new_pdf_path, page_num):
#     """Returns coordinates of differences for a specific page."""
#     doc_old = fitz.open(old_pdf_path)
#     doc_new = fitz.open(new_pdf_path)
    
#     # Handle case where page might not exist in one version
#     if page_num >= len(doc_old) or page_num >= len(doc_new):
#         return [], []

#     page_old = doc_old[page_num]
#     page_new = doc_new[page_num]

#     # Get word-level data with coordinates
#     words_old = page_old.get_text("words") # [x0, y0, x1, y1, "word", ...]
#     words_new = page_new.get_text("words")

#     text_old = [w[4] for w in words_old]
#     text_new = [w[4] for w in words_new]

#     diff = difflib.SequenceMatcher(None, text_old, text_new)
    
#     old_highlights = []
#     new_highlights = []

#     for tag, i1, i2, j1, j2 in diff.get_opcodes():
#         if tag != 'equal':
#             # Collect bounding boxes for deleted/changed text
#             for idx in range(i1, i2):
#                 old_highlights.append(words_old[idx][:4])
#             # Collect bounding boxes for added/changed text
#             for idx in range(j1, j2):
#                 new_highlights.append(words_new[idx][:4])
                
#     return old_highlights, new_highlights

# def render_page_with_highlights(pdf_path, page_num, highlights, color=(1, 0, 0)):
#     """Renders a PDF page to an image with highlight boxes."""
#     doc = fitz.open(pdf_path)
#     page = doc[page_num]
    
#     # Draw rectangles on a copy of the page
#     for bbox in highlights:
#         annot = page.add_rect_annot(bbox)
#         annot.set_colors(stroke=color)
#         annot.update()
        
#     pix = page.get_pixmap(matrix=fitz.Matrix(2, 2)) # Higher resolution
#     return pix.tobytes()



# === (Updated with Audit Logic)


import fitz
import difflib

def get_full_doc_data(pdf_path):
    """Extracts every word with coordinates, styling, and page index."""
    doc = fitz.open(pdf_path)
    all_data = []
    for page_num, page in enumerate(doc):
        dict_data = page.get_text("dict")
        for block in dict_data["blocks"]:
            if "lines" in block:
                for line in block["lines"]:
                    for span in line["spans"]:
                        words = span["text"].split()
                        for word in words:
                            # We store metadata to track style and location
                            all_data.append({
                                "text": word,
                                "bbox": span["bbox"],
                                "page": page_num + 1,
                                "font": span["font"],
                                "size": round(span["size"], 1)
                            })
    return all_data

def run_global_comparison(old_path, new_path):
    """Aligns two PDFs and identifies content and style differences."""
    old_data = get_full_doc_data(old_path)
    new_data = get_full_doc_data(new_path)
    
    old_text = [w["text"] for w in old_data]
    new_text = [w["text"] for w in new_data]

    # Global alignment to handle page insertions/deletions
    sm = difflib.SequenceMatcher(None, old_text, new_text)
    diff_results = []

    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal':
            # Check for style changes within 'equal' text
            for o, n in zip(old_data[i1:i2], new_data[j1:j2]):
                if o["font"] != n["font"] or o["size"] != n["size"]:
                    diff_results.append({
                        "tag": "style_change",
                        "page": n["page"],
                        "old_val": f"{o['text']} ({o['font']} {o['size']}pt)",
                        "new_val": f"{n['text']} ({n['font']} {n['size']}pt)",
                        "old_words": [o], "new_words": [n]
                    })
        else:
            # Content changes (replace, delete, insert)
            p_num = old_data[i1]["page"] if i1 < len(old_data) else new_data[j1]["page"]
            diff_results.append({
                "tag": tag,
                "page": p_num,
                "old_val": " ".join(old_text[i1:i2]),
                "new_val": " ".join(new_text[j1:j2]),
                "old_words": old_data[i1:i2],
                "new_words": new_data[j1:j2]
            })
            
    return diff_results








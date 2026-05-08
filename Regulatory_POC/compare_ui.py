# ==== working

# import streamlit as st
# import sqlite3
# import pandas as pd
# from compare_pdf import run_comparison, init_db, DB_NAME

# st.set_page_config(layout="wide", page_title="PDF Audit HITL")
# init_db()

# st.title("🛡️ Enterprise PDF Change Auditor")

# # 1. Upload Section
# with st.sidebar:
#     st.header("Batch Upload")
#     old_file = st.file_uploader("Original PDF", type="pdf")
#     new_file = st.file_uploader("Modified PDF", type="pdf")
    
#     if st.button("Start Comparison"):
#         if old_file and new_file:
#             # Save temporary files
#             with open("temp_old.pdf", "wb") as f: f.write(old_file.read())
#             with open("temp_new.pdf", "wb") as f: f.write(new_file.read())
            
#             with st.spinner("Analyzing character-level differences..."):
#                 run_comparison("temp_old.pdf", "temp_new.pdf")
#             st.success("Comparison complete!")

# # 2. Review Queue
# st.header("Review Queue")
# conn = sqlite3.connect(DB_NAME)
# query = "SELECT * FROM diff_results WHERE status = 'Pending'"
# df = pd.read_sql_query(query, conn)

# if not df.empty:
#     # Progress Bar
#     total_done = pd.read_sql_query("SELECT count(*) as count FROM diff_results WHERE status != 'Pending'", conn).iloc[0]['count']
#     total_all = pd.read_sql_query("SELECT count(*) as count FROM diff_results", conn).iloc[0]['count']
#     st.progress(total_done / total_all if total_all > 0 else 0)
#     st.write(f"Total Reviewed: {total_done} / {total_all}")

#     # Display Current Change
#     row = df.iloc[0]
#     with st.container(border=True):
#         st.write(f"**File:** {row['file_name']} | **Page:** {row['page_num']} | **Type:** {row['change_type']}")
        
#         c1, c2 = st.columns(2)
#         c1.markdown("### Old Version")
#         c1.error(row['old_val'] if row['old_val'] else "[Empty]")
        
#         c2.markdown("### New Version")
#         c2.success(row['new_val'] if row['new_val'] else "[Empty]")
        
#         st.caption(f"ℹ️ **Technical Note:** {row['style_info']}")
        
#         # Action Buttons
#         btn1, btn2, btn3 = st.columns(3)
#         if btn1.button("✅ Accept Change"):
#             conn.execute("UPDATE diff_results SET status='Accepted' WHERE id=?", (int(row['id']),))
#             conn.commit()
#             st.rerun()
            
#         if btn2.button("❌ Flag as Error"):
#             conn.execute("UPDATE diff_results SET status='Error' WHERE id=?", (int(row['id']),))
#             conn.commit()
#             st.rerun()

#         if btn3.button("⏭️ Skip"):
#             st.warning("Skipped for now.")
# else:
#     st.balloons()
#     st.success("Queue is empty. All 800+ PDFs processed!")

# conn.close()


# ====== working image bbox

# import streamlit as st
# from compare_pdf import get_page_diffs, render_page_with_highlights

# st.set_page_config(layout="wide", page_title="Visual PDF Diff")

# # Session state to track current page
# if 'page_idx' not in st.session_state:
#     st.session_state.page_idx = 0

# st.title("📄 Visual Side-by-Side PDF Audit")

# with st.sidebar:
#     st.header("Upload Documents")
#     old_file = st.file_uploader("Original PDF", type="pdf", key="old")
#     new_file = st.file_uploader("Modified PDF", type="pdf", key="new")
    
#     if old_file and new_file:
#         # Save locally for PyMuPDF access
#         with open("v1.pdf", "wb") as f: f.write(old_file.getvalue())
#         with open("v2.pdf", "wb") as f: f.write(new_file.getvalue())
#         st.success("Files loaded.")

# # Controls for Page Navigation
# col_prev, col_page, col_next = st.columns([1, 2, 1])
# if col_prev.button("⬅️ Previous Page") and st.session_state.page_idx > 0:
#     st.session_state.page_idx -= 1
# if col_next.button("Next Page ➡️"):
#     st.session_state.page_idx += 1

# if old_file and new_file:
#     # 1. Calculate Diffs for current page
#     old_boxes, new_boxes = get_page_diffs("v1.pdf", "v2.pdf", st.session_state.page_idx)
    
#     # 2. Render Images
#     img_old = render_page_with_highlights("v1.pdf", st.session_state.page_idx, old_boxes, color=(1, 0, 0))
#     img_new = render_page_with_highlights("v2.pdf", st.session_state.page_idx, new_boxes, color=(0, 0.7, 0))

#     # 3. Display Side-by-Side
#     c1, c2 = st.columns(2)
#     with c1:
#         st.subheader("Original (Deletions in Red)")
#         st.image(img_old, use_container_width=True)
#     with c2:
#         st.subheader("Modified (Additions in Green)")
#         st.image(img_new, use_container_width=True)

#     # 4. HITL Action Bar
#     st.divider()
#     act1, act2, act3 = st.columns([1, 1, 2])
#     with act1:
#         if st.button("✅ Accept All Page Changes", use_container_width=True):
#             st.toast(f"Page {st.session_state.page_idx + 1} Approved")
#     with act2:
#         if st.button("❌ Reject / Flag Page", use_container_width=True):
#             st.error(f"Page {st.session_state.page_idx + 1} Marked for Review")
#     with act3:
#         st.text_input("Comments for this page:")

# else:
#     st.info("Please upload two PDFs to begin the visual comparison.")



# === (Updated with Audit Logic)


# import streamlit as st
# import fitz
# import pandas as pd
# from io import BytesIO
# from compare_pdf import run_global_comparison

# st.set_page_config(layout="wide", page_title="Enterprise PDF Auditor")

# # --- INITIALIZE STATE ---
# if 'audit_log' not in st.session_state:
#     st.session_state.audit_log = []
# if 'current_file_idx' not in st.session_state:
#     st.session_state.current_file_idx = 0

# st.title("🛡️ Enterprise PDF Auditor & Report Generator")

# # --- SIDEBAR CONTROLS ---
# with st.sidebar:
#     st.header("Batch Upload")
#     old_files = st.file_uploader("Original PDFs", accept_multiple_files=True)
#     new_files = st.file_uploader("Modified PDFs", accept_multiple_files=True)
    
#     st.divider()
#     if st.button("📊 Export Audit Report (Excel)"):
#         if st.session_state.audit_log:
#             df = pd.DataFrame(st.session_state.audit_log)
#             output = BytesIO()
#             with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
#                 df.to_excel(writer, index=False, sheet_name='Audit_Trail')
#             st.download_button(
#                 label="📥 Download Excel File",
#                 data=output.getvalue(),
#                 file_name="pdf_audit_report.xlsx",
#                 mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
#             )
#         else:
#             st.warning("No audit data captured yet.")

# # --- RENDERER WITH NONETYPE FIX ---
# def draw_highlights(pdf_path, p_idx, current_diffs, mode='new'):
#     doc = fitz.open(pdf_path)
#     if p_idx < 0 or p_idx >= len(doc):
#         return None
        
#     page = doc[p_idx]
#     color = (0, 0.6, 0) if mode == 'new' else (1, 0, 0)
    
#     for d in current_diffs:
#         words = d['new_words'] if mode == 'new' else d['old_words']
#         for w in words:
#             # Word must belong to current page and have a valid coordinate
#             if w['page'] == p_idx + 1 and w['bbox']:
#                 try:
#                     annot = page.add_rect_annot(w['bbox'])
#                     if annot: # FIX: Verify annot is not None before calling update
#                         annot.set_colors(stroke=color)
#                         annot.update()
#                 except:
#                     continue 
    
#     pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
#     return pix.tobytes()

# # --- MAIN UI LOGIC ---
# if old_files and new_files and len(old_files) == len(new_files):
#     old_pdf = old_files[st.session_state.current_file_idx]
#     new_pdf = new_files[st.session_state.current_file_idx]
    
#     # Save temp files for PyMuPDF
#     with open("temp_v1.pdf", "wb") as f: f.write(old_pdf.getvalue())
#     with open("temp_v2.pdf", "wb") as f: f.write(new_pdf.getvalue())

#     # Get Global Diffs
#     diffs = run_global_comparison("temp_v1.pdf", "temp_v2.pdf")
    
#     # Page Navigation
#     doc2 = fitz.open("temp_v2.pdf")
#     total_pages = len(doc2)
#     page_num = st.sidebar.number_input("Page Viewer", 1, total_pages, 1) - 1

#     # Visual Display
#     col1, col2 = st.columns(2)
#     with col1:
#         st.subheader("Original (Deletions/Changes)")
#         img1 = draw_highlights("temp_v1.pdf", page_num, diffs, 'old')
#         if img1: st.image(img1, use_container_width=True)
#     with col2:
#         st.subheader("Modified (Additions/Styles)")
#         img2 = draw_highlights("temp_v2.pdf", page_num, diffs, 'new')
#         if img2: st.image(img2, use_container_width=True)

#     # --- HITL DECISION SECTION ---
#     st.divider()
#     st.subheader(f"Reviewing Page {page_num + 1}")
#     page_diffs = [d for d in diffs if d['page'] == page_num + 1]
    
#     if page_diffs:
#         for i, d in enumerate(page_diffs):
#             with st.expander(f"Change #{i+1}: {d['tag'].upper()}"):
#                 st.write(f"**Old:** {d['old_val']}")
#                 st.write(f"**New:** {d['new_val']}")
                
#                 c1, c2 = st.columns(2)
#                 if c1.button("✅ Accept", key=f"acc_{page_num}_{i}"):
#                     st.session_state.audit_log.append({
#                         "File": new_pdf.name, "Page": d['page'], "Type": d['tag'],
#                         "Old": d['old_val'], "New": d['new_val'], "Decision": "Accepted"
#                     })
#                     st.toast("Change Accepted")
#                 if c2.button("❌ Reject", key=f"rej_{page_num}_{i}"):
#                     st.session_state.audit_log.append({
#                         "File": new_pdf.name, "Page": d['page'], "Type": d['tag'],
#                         "Old": d['old_val'], "New": d['new_val'], "Decision": "Rejected"
#                     })
#                     st.toast("Change Rejected")
#     else:
#         st.info("No differences detected on this page.")
# else:
#     st.info("Please upload an equal number of Original and Modified PDFs to start.")


# ======== new jurisdiction 


# import streamlit as st
# import fitz
# import pandas as pd
# from io import BytesIO
# import datetime
# from compare_pdf import run_global_comparison

# st.set_page_config(layout="wide", page_title="Enterprise PDF Auditor")

# # --- INITIALIZE STATE ---
# if 'audit_log' not in st.session_state:
#     st.session_state.audit_log = []
# if 'current_file_idx' not in st.session_state:
#     st.session_state.current_file_idx = 0

# st.title("🛡️ Enterprise PDF Auditor & Report Generator")

# # --- SIDEBAR CONTROLS & METADATA ---
# with st.sidebar:
#     st.header("1. Document Upload")
#     old_files = st.file_uploader("Original PDFs", accept_multiple_files=True)
#     new_files = st.file_uploader("Modified PDFs", accept_multiple_files=True)
    
#     st.divider()
#     st.header("2. Compliance Metadata")
#     jurisdiction = st.selectbox("Jurisdiction Context", [
#         "Nevada (NGCB)", 
#         "New York (NYSGC)", 
#         "New Jersey (DGE)", 
#         "Federal", 
#         "Other"
#     ])
#     detected_date = st.date_input("Scrape / Detection Date", datetime.date.today())
    
#     st.divider()
#     st.header("3. AI Filter Settings")
#     # THE CRUCIAL POC FEATURE: The semantic filter toggle
#     ignore_style = st.checkbox("Hide Formatting/Style Changes", value=True, help="Toggle to hide font, size, and minor styling changes to focus only on legal content.")
    
#     st.divider()
#     if st.button("📊 Export Audit Report (Excel)"):
#         if st.session_state.audit_log:
#             df = pd.DataFrame(st.session_state.audit_log)
#             output = BytesIO()
#             with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
#                 df.to_excel(writer, index=False, sheet_name='Audit_Trail')
#             st.download_button(
#                 label="📥 Download Excel File",
#                 data=output.getvalue(),
#                 file_name=f"Audit_{jurisdiction.split()[0]}_{datetime.date.today()}.xlsx",
#                 mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
#             )
#         else:
#             st.warning("No audit data captured yet.")

# # --- RENDERER ---
# def draw_highlights(pdf_path, p_idx, current_diffs, mode='new', ignore_formatting=True):
#     doc = fitz.open(pdf_path)
#     if p_idx < 0 or p_idx >= len(doc):
#         return None
        
#     page = doc[p_idx]
#     color = (0, 0.6, 0) if mode == 'new' else (1, 0, 0)
    
#     for d in current_diffs:
#         # Filter out highlights if the user wants to ignore formatting
#         if ignore_formatting and d['tag'] == 'style_change':
#             continue
            
#         words = d['new_words'] if mode == 'new' else d['old_words']
#         for w in words:
#             if w['page'] == p_idx + 1 and w['bbox']:
#                 try:
#                     annot = page.add_rect_annot(w['bbox'])
#                     if annot: 
#                         annot.set_colors(stroke=color)
#                         annot.update()
#                 except:
#                     continue 
    
#     pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
#     return pix.tobytes()

# # --- MAIN UI LOGIC ---
# if old_files and new_files and len(old_files) == len(new_files):
#     old_pdf = old_files[st.session_state.current_file_idx]
#     new_pdf = new_files[st.session_state.current_file_idx]
    
#     with open("temp_v1.pdf", "wb") as f: f.write(old_pdf.getvalue())
#     with open("temp_v2.pdf", "wb") as f: f.write(new_pdf.getvalue())

#     diffs = run_global_comparison("temp_v1.pdf", "temp_v2.pdf")
    
#     doc2 = fitz.open("temp_v2.pdf")
#     total_pages = len(doc2)
#     page_num = st.sidebar.number_input("Page Viewer", 1, total_pages, 1) - 1

#     # Visual Display
#     col1, col2 = st.columns(2)
#     with col1:
#         st.subheader("Original (Deletions/Changes)")
#         img1 = draw_highlights("temp_v1.pdf", page_num, diffs, 'old', ignore_style)
#         if img1: st.image(img1, use_container_width=True)
#     with col2:
#         st.subheader("Modified (Additions/Styles)")
#         img2 = draw_highlights("temp_v2.pdf", page_num, diffs, 'new', ignore_style)
#         if img2: st.image(img2, use_container_width=True)

#     # --- HITL DECISION SECTION ---
#     st.divider()
#     st.subheader(f"Reviewing Page {page_num + 1}")
    
#     # Filter diffs for the current page
#     page_diffs = [d for d in diffs if d['page'] == page_num + 1]
    
#     # APPLY THE AI NOISE FILTER TO THE QUEUE
#     if ignore_style:
#         page_diffs = [d for d in page_diffs if d['tag'] != 'style_change']
    
#     if page_diffs:
#         for i, d in enumerate(page_diffs):
#             # Dynamic styling based on change type
#             expander_title = f"🔴 Content Change detected" if d['tag'] != 'style_change' else f"🔵 Formatting Change detected"
            
#             with st.expander(f"Change #{i+1}: {expander_title}"):
#                 st.write(f"**Old:** {d['old_val']}")
#                 st.write(f"**New:** {d['new_val']}")
                
#                 c1, c2 = st.columns(2)
#                 if c1.button("✅ Accept into Sharepoint", key=f"acc_{page_num}_{i}"):
#                     st.session_state.audit_log.append({
#                         "Jurisdiction": jurisdiction,
#                         "Detection Date": detected_date.strftime("%Y-%m-%d"),
#                         "File": new_pdf.name, 
#                         "Page": d['page'], 
#                         "Change Type": d['tag'].upper(),
#                         "Original Text": d['old_val'], 
#                         "Modified Text": d['new_val'], 
#                         "Review Decision": "Accepted"
#                     })
#                     st.toast("Change Accepted and Logged!")
                    
#                 if c2.button("❌ Reject (False Flag)", key=f"rej_{page_num}_{i}"):
#                     st.session_state.audit_log.append({
#                         "Jurisdiction": jurisdiction,
#                         "Detection Date": detected_date.strftime("%Y-%m-%d"),
#                         "File": new_pdf.name, 
#                         "Page": d['page'], 
#                         "Change Type": d['tag'].upper(),
#                         "Original Text": d['old_val'], 
#                         "Modified Text": d['new_val'], 
#                         "Review Decision": "Rejected"
#                     })
#                     st.toast("Change Rejected!")
#     else:
#         if ignore_style:
#             st.success("No critical content changes detected on this page. (Formatting changes are hidden).")
#         else:
#             st.info("No differences detected on this page.")
# else:
#     st.info("Please upload an equal number of Original and Modified PDFs to start.")


# ==== jurisdiction + export

import streamlit as st
import fitz
import pandas as pd
from io import BytesIO
import datetime
from compare_pdf import run_global_comparison

st.set_page_config(layout="wide", page_title="Enterprise PDF Auditor")

# --- INITIALIZE STATE ---
if 'audit_log' not in st.session_state:
    st.session_state.audit_log = []
if 'current_file_idx' not in st.session_state:
    st.session_state.current_file_idx = 0

st.title("🛡️ Enterprise PDF Auditor & Report Generator")

# --- PERFORMANCE CACHING (The Real-Time Fix) ---
# This ensures the heavy PDF comparison only runs ONCE per file upload.
@st.cache_data(show_spinner="Analyzing PDF differences. This only happens once...")
def get_cached_diffs(file1_name, file1_bytes, file2_name, file2_bytes):
    with open("temp_v1.pdf", "wb") as f: f.write(file1_bytes)
    with open("temp_v2.pdf", "wb") as f: f.write(file2_bytes)
    return run_global_comparison("temp_v1.pdf", "temp_v2.pdf")

# --- SIDEBAR CONTROLS & METADATA ---
with st.sidebar:
    st.header("1. Document Upload")
    old_files = st.file_uploader("Original PDFs", accept_multiple_files=True)
    new_files = st.file_uploader("Modified PDFs", accept_multiple_files=True)
    
    st.divider()
    st.header("2. Compliance Metadata")
    jurisdiction = st.selectbox("Jurisdiction Context", [
        "Nevada (NGCB)", 
        "New York (NYSGC)", 
        "New Jersey (DGE)", 
        "Federal", 
        "Other"
    ])
    detected_date = st.date_input("Scrape / Detection Date", datetime.date.today())
    
    st.divider()
    st.header("3. AI Filter Settings")
    # This will now toggle instantly because the diffs are cached!
    ignore_style = st.checkbox("Hide Formatting/Style Changes", value=True, help="Toggle to hide font, size, and minor styling changes to focus only on legal content.")
    
    st.divider()
    
    # --- CSV EXPORT FIX ---
    if st.button("📊 Export Audit Report (CSV)"):
        if st.session_state.audit_log:
            df = pd.DataFrame(st.session_state.audit_log)
            csv_data = df.to_csv(index=False).encode('utf-8')
            
            st.download_button(
                label="📥 Download CSV File",
                data=csv_data,
                file_name=f"Audit_{jurisdiction.split()[0]}_{datetime.date.today()}.csv",
                mime="text/csv"
            )
        else:
            st.warning("No data yet. You must click 'Accept' or 'Reject' on a change to log it!")

# --- RENDERER ---
def draw_highlights(pdf_path, p_idx, current_diffs, mode='new', ignore_formatting=True):
    doc = fitz.open(pdf_path)
    if p_idx < 0 or p_idx >= len(doc):
        return None
        
    page = doc[p_idx]
    color = (0, 0.6, 0) if mode == 'new' else (1, 0, 0)
    
    for d in current_diffs:
        # Filter out highlights if the user wants to ignore formatting
        if ignore_formatting and d['tag'] == 'style_change':
            continue
            
        words = d['new_words'] if mode == 'new' else d['old_words']
        for w in words:
            if w['page'] == p_idx + 1 and w['bbox']:
                try:
                    annot = page.add_rect_annot(w['bbox'])
                    if annot: 
                        annot.set_colors(stroke=color)
                        annot.update()
                except:
                    continue 
    
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
    return pix.tobytes()

# --- MAIN UI LOGIC ---
if old_files and new_files and len(old_files) == len(new_files):
    old_pdf = old_files[st.session_state.current_file_idx]
    new_pdf = new_files[st.session_state.current_file_idx]
    
    # Call the cached function instead of running it raw
    diffs = get_cached_diffs(old_pdf.name, old_pdf.getvalue(), new_pdf.name, new_pdf.getvalue())
    
    doc2 = fitz.open("temp_v2.pdf")
    total_pages = len(doc2)
    page_num = st.sidebar.number_input("Page Viewer", 1, total_pages, 1) - 1

    # Visual Display
    col1, col2 = st.columns(2)
    with col1:
        st.subheader("Original (Deletions/Changes)")
        img1 = draw_highlights("temp_v1.pdf", page_num, diffs, 'old', ignore_style)
        if img1: st.image(img1, use_container_width=True)
    with col2:
        st.subheader("Modified (Additions/Styles)")
        img2 = draw_highlights("temp_v2.pdf", page_num, diffs, 'new', ignore_style)
        if img2: st.image(img2, use_container_width=True)

    # --- HITL DECISION SECTION ---
    st.divider()
    st.subheader(f"Reviewing Page {page_num + 1}")
    
    page_diffs = [d for d in diffs if d['page'] == page_num + 1]
    
    if ignore_style:
        page_diffs = [d for d in page_diffs if d['tag'] != 'style_change']
    
    if page_diffs:
        for i, d in enumerate(page_diffs):
            expander_title = f"🔴 Content Change detected" if d['tag'] != 'style_change' else f"🔵 Formatting Change detected"
            
            with st.expander(f"Change #{i+1}: {expander_title}"):
                st.write(f"**Old:** {d['old_val']}")
                st.write(f"**New:** {d['new_val']}")
                
                c1, c2 = st.columns(2)
                if c1.button("✅ Accept into Sharepoint", key=f"acc_{page_num}_{i}"):
                    st.session_state.audit_log.append({
                        "Jurisdiction": jurisdiction,
                        "Detection Date": detected_date.strftime("%Y-%m-%d"),
                        "File": new_pdf.name, 
                        "Page": d['page'], 
                        "Change Type": d['tag'].upper(),
                        "Original Text": d['old_val'], 
                        "Modified Text": d['new_val'], 
                        "Review Decision": "Accepted"
                    })
                    st.toast("Change Accepted and Logged!")
                    
                if c2.button("❌ Reject (False Flag)", key=f"rej_{page_num}_{i}"):
                    st.session_state.audit_log.append({
                        "Jurisdiction": jurisdiction,
                        "Detection Date": detected_date.strftime("%Y-%m-%d"),
                        "File": new_pdf.name, 
                        "Page": d['page'], 
                        "Change Type": d['tag'].upper(),
                        "Original Text": d['old_val'], 
                        "Modified Text": d['new_val'], 
                        "Review Decision": "Rejected"
                    })
                    st.toast("Change Rejected!")
    else:
        if ignore_style:
            st.success("No critical content changes detected on this page. (Formatting changes are hidden).")
        else:
            st.info("No differences detected on this page.")
else:
    st.info("Please upload an equal number of Original and Modified PDFs to start.")

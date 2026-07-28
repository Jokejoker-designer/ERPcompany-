# Triển khai xuất báo giá động vào App 8777

Giữ Python http.server + SQLite + vanilla JS.

Trong docgen.py:
1. Chọn file theo quotation.template_id.
2. Hàng 15 là prototype row.
3. Chèn N-1 dòng cho N quotation_item.
4. Copy style, border, alignment, row height, number format và validation.
5. Điền đúng N items, không để dòng rỗng.
6. Tính lại tổng tiền phía server.
7. Thiết lập:
   ws.print_area = f"A1:I{last_used_row}"
   ws.page_setup.orientation = "landscape"
   ws.page_setup.fitToWidth = 1
   ws.page_setup.fitToHeight = 0
   ws.sheet_properties.pageSetUpPr.fitToPage = True
   ws.print_title_rows = "14:14"
8. Không được dùng fitToHeight=1.
9. Test 1, 3, 10, 31, 75 và 150 dòng.

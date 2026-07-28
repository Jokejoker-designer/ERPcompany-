# API mapping

| Màn hình mới | API runtime |
|---|---|
| Login/session | `/api/login`, `/api/me`, `/api/logout` |
| Dashboard | `/api/dashboard`, `/api/dashboard_charts` |
| Việc của tôi | `/api/my_work_queue`, `/api/viec_hom_nay_cua_toi` |
| Workflow | `/api/workflow_resume`, `/api/workflow_templates`, `/api/workflow_instance` |
| Khách hàng | `/api/customers`, `/api/customer_360` |
| Công trình | `/api/ct_projects`, `/api/ct_tong_quan` |
| Báo giá | `/api/quotations`, `/api/quotation` |
| Tài liệu | `/api/documents`, `/api/document_download` |
| Công nợ | `/api/receivable` |
| Tin nhắn | `/api/chat/conversations`, `/api/chat/messages`, `/api/chat/send`, `/api/chat/read`, `/api/chat/direct`, `/api/chat/contacts`, `/api/chat/stream` |
| Cấu hình | `/api/cau_hinh_tong_hop` |

Mọi request dùng same-origin cookie. Frontend không tự quyết định quyền; 401/403 từ backend là kết quả cuối cùng.

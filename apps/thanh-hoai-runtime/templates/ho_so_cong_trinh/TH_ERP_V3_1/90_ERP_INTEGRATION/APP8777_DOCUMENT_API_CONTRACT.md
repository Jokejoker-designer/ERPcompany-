# APP 8777 - Document Package API Contract V3

## Read
- `GET /api/project_document_checklist?project_id=`
- `GET /api/project_document_tree?project_id=`
- `GET /api/document_templates?project_type=`
- `GET /api/document_versions?document_id=`
- `GET /api/document_audit?document_id=`

## Write
- `POST /api/write/document_generate`
- `POST /api/write/document_submit`
- `POST /api/write/document_review`
- `POST /api/write/document_approve`
- `POST /api/write/document_issue`
- `POST /api/write/document_sign_register`
- `POST /api/write/document_create_revision`
- `POST /api/write/document_mark_not_applicable`

## Hard rules
- Backend resolves template path from `template_id`; the client cannot supply an arbitrary filesystem path.
- Every write checks role and project/object scope.
- Generated customer quotation contains one sheet only.
- Dynamic tables contain exactly the number of source records.
- Signed artifacts are immutable; changes create a new revision.
- Every state change writes an audit event.

# Thay đổi server.py

Thay:

```python
WEB_DIR = os.path.join(BASE, "web")
```

bằng:

```python
# MODERN_UI_WEB_DIR_V1
_web_dir_setting = os.environ.get("THANH_HOAI_WEB_DIR", "").strip()
if _web_dir_setting:
    WEB_DIR = (_web_dir_setting if os.path.isabs(_web_dir_setting)
               else os.path.join(BASE, _web_dir_setting))
    WEB_DIR = os.path.abspath(WEB_DIR)
else:
    WEB_DIR = os.path.join(BASE, "web")
```

Đây là thay đổi additive. Không đặt biến môi trường thì hành vi cũ giữ nguyên.

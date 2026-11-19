#!/usr/bin/env python3
"""提供真实HTTP记录与CSV样例，数据和请求审计仅写入指定新目录。 @author Pjh"""

import argparse
import csv
import io
import json
import os
from pathlib import Path
import re
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlsplit
import uuid

VERSION = "app-acceptance-example-v1"


def main():
    """绑定本机动态端口，按场景模拟表头缺失、持久化丢失或页面编号错误。 @author Pjh"""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", required=True, type=Path)
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--mode", choices=["healthy", "missing-header", "lost-write", "wrong-record-id"], default="healthy")
    args = parser.parse_args()
    if not args.data_dir.is_absolute():
        parser.error("--data-dir需要新的绝对目录")
    args.data_dir.mkdir(parents=True, exist_ok=False)
    records_file = args.data_dir / "records.json"
    audit_file = args.data_dir / "http.jsonl"
    records_file.write_text("[]\n", encoding="utf-8")
    html = Path(__file__).with_name("index.html").read_text(encoding="utf-8")
    if args.mode == "missing-header":
        html = re.sub(r"<thead>.*?</thead>", "", html, flags=re.S)
    elif args.mode == "wrong-record-id":
        html = html.replace(
            "for (const value of [record.id, record.name]) {",
            'for (const value of [record.id + "-wrong", record.name]) {',
            1,
        )

    class Handler(BaseHTTPRequestHandler):
        """使用同一公开契约记录实际请求，控制模式只在启动记录中披露。 @author Pjh"""
        def log_message(self, format_string, *values):
            pass

        def respond(self, status, content, content_type="application/json; charset=utf-8", body=None, attachment=False):
            """发送真实响应，并在指定目录保留请求审计。 @author Pjh"""
            if isinstance(content, (dict, list)):
                content = json.dumps(content, ensure_ascii=False)
            payload = content.encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(payload)))
            if attachment:
                self.send_header("Content-Disposition", 'attachment; filename="records.csv"')
            self.end_headers()
            self.wfile.write(payload)
            with audit_file.open("a", encoding="utf-8") as stream:
                stream.write(json.dumps({"method": self.command, "path": self.path, "status": status, "body": body}, ensure_ascii=False) + "\n")

        def do_GET(self):
            """读取当前记录或实际CSV，健康接口只报告版本和进程。 @author Pjh"""
            route = urlsplit(self.path).path
            if route in {"/", "/index.html"}:
                self.respond(200, html, "text/html; charset=utf-8")
            elif route == "/health":
                self.respond(200, {"version": VERSION, "pid": os.getpid()})
            elif route == "/api/records":
                self.respond(200, {"records": json.loads(records_file.read_text(encoding="utf-8"))})
            elif route == "/api/records.csv":
                buffer = io.StringIO(newline="")
                writer = csv.DictWriter(buffer, fieldnames=["id", "name"])
                writer.writeheader()
                writer.writerows(json.loads(records_file.read_text(encoding="utf-8")))
                self.respond(200, buffer.getvalue(), "text/csv; charset=utf-8", attachment=True)
            else:
                self.respond(404, {"error": "资源不存在"})

        def do_POST(self):
            """校验新增输入，健康模式在成功响应前完成持久写入。 @author Pjh"""
            if urlsplit(self.path).path != "/api/records":
                self.respond(404, {"error": "资源不存在"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 65536:
                    raise ValueError("请求长度无效")
                body = json.loads(self.rfile.read(length))
                name = body.get("name")
                if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80:
                    raise ValueError("记录名称需为1至80个字符")
            except (ValueError, AttributeError) as error:
                self.respond(400, {"error": str(error)})
                return
            record = {"id": str(uuid.uuid4()), "name": name.strip()}
            if args.mode != "lost-write":
                records = json.loads(records_file.read_text(encoding="utf-8"))
                records.append(record)
                pending = records_file.with_suffix(".pending")
                pending.write_text(json.dumps(records, ensure_ascii=False) + "\n", encoding="utf-8")
                pending.replace(records_file)
            self.respond(201, record, body=body)

    with HTTPServer(("127.0.0.1", args.port), Handler) as server:
        print(json.dumps({"url": f"http://127.0.0.1:{server.server_port}", "pid": os.getpid(), "version": VERSION, "mode": args.mode, "dataDir": str(args.data_dir)}, ensure_ascii=False), flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()

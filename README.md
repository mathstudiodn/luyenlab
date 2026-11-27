# Toán Studio trên Cloudflare Pages

Dùng lại repo GitHub và dự án Supabase đang lưu câu hỏi, tài khoản, hình ảnh và kết quả. Gói này dựa trên bản Ghi chú. Nếu đã sửa mã trực tiếp trên GitHub, đối chiếu thay đổi trước khi gộp.

1. Tạo nhánh cloudflare-pages từ main và đưa nội dung gói vào thư mục gốc của nhánh. Giữ nguyên main trong lúc thử.
2. Tạo dự án Pages, chọn Git integration và repo mathstudio. Chọn cloudflare-pages làm production branch. Framework None, build command node scripts/build.mjs, output dist, thư mục gốc để trống.
3. Trong Settings → Variables and Secrets của Pages, đặt GEMINI_API_KEY (Secret) cho Production. Nếu Netlify có cấu hình GEMINI_MODEL riêng, dùng cùng tên model tại Pages. Deploy lại sau khi thêm biến. Build tự lấy Project URL và publishable key của Supabase từ public/config.js nếu không có biến thay thế.
4. Dùng tên miền pages.dev được cấp để thử luyện nhanh, đăng nhập học sinh, lưu và mở lại kết quả, đăng nhập Admin, mở ngân hàng và dán một ảnh để chuyển sang TeX. Nếu dùng link xác nhận hoặc khôi phục mật khẩu của Supabase, cập nhật URL chuyển hướng cho tên miền mới.
5. Chỉ khi tất cả hoạt động mới gửi URL mới cho học sinh và ngắt tự động deploy trên Netlify. Phiên đăng nhập và dữ liệu chỉ lưu trong trình duyệt thuộc từng tên miền. Học sinh đăng nhập lại trên tên miền mới.
6. Các tệp SQL đi kèm dùng để đối chiếu. Trên cơ sở dữ liệu hiện có, chỉ chạy migration của tính năng chưa cài (ví dụ bank-notes.sql nếu nâng cấp lên Ghi chú lần đầu). Không chạy lại seed khi chuyển hosting.

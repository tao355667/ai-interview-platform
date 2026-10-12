package tools

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Build a portable, synthetic text PDF; no personal files or OCR service needed.
func testPDFPath(t *testing.T) string {
	t.Helper()
	var buf bytes.Buffer
	buf.WriteString("%PDF-1.4\n")
	content := "BT /F1 12 Tf 50 750 Td (Test Candidate) Tj 0 -20 Td (candidate@example.invalid) Tj 0 -20 Td (Skills: Go, Redis, MySQL) Tj ET"
	objects := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
		fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(content), content),
	}
	offsets := []int{0}
	for i, object := range objects {
		offsets = append(offsets, buf.Len())
		fmt.Fprintf(&buf, "%d 0 obj\n%s\nendobj\n", i+1, object)
	}
	xref := buf.Len()
	fmt.Fprintf(&buf, "xref\n0 %d\n0000000000 65535 f \n", len(offsets))
	for _, offset := range offsets[1:] {
		fmt.Fprintf(&buf, "%010d 00000 n \n", offset)
	}
	fmt.Fprintf(&buf, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(offsets), xref)
	path := filepath.Join(t.TempDir(), "resume.pdf")
	if err := os.WriteFile(path, buf.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestExtractResume_Success(t *testing.T) {
	ctx := context.Background()

	t.Run("pdf_merge_mode", func(t *testing.T) {
		req := &ResumeExtractionRequest{
			FilePath:  testPDFPath(t),
			EnableOCR: true,
			Language:  "en",
		}

		result, err := ExtractResume(ctx, req)
		if err != nil {
			t.Fatalf("PDF简历解析失败: %v", err)
		}

		if !result.Success {
			t.Errorf("期望成功，实际失败: %s", result.ErrorMsg)
		}
		if result.TotalPages <= 0 {
			t.Errorf("期望总页数>0，实际=%d", result.TotalPages)
		}
		if result.RawText == "" {
			t.Error("提取的原始文本为空")
		}
		if result.Meta == nil {
			t.Error("Meta不应为nil")
		}
	})

	t.Run("language_zh", func(t *testing.T) {
		req := &ResumeExtractionRequest{
			FilePath:  testPDFPath(t),
			EnableOCR: true,
			Language:  "zh",
		}

		result, err := ExtractResume(ctx, req)
		if err != nil {
			t.Fatalf("中文PDF简历解析失败: %v", err)
		}

		if !result.Success {
			t.Errorf("期望成功，实际失败: %s", result.ErrorMsg)
		}
	})

	t.Run("ocr_disabled", func(t *testing.T) {
		req := &ResumeExtractionRequest{
			FilePath:  testPDFPath(t),
			EnableOCR: false,
			Language:  "en",
		}

		result, err := ExtractResume(ctx, req)
		if err != nil {
			t.Fatalf("OCR禁用模式解析失败: %v", err)
		}

		if !result.Success {
			t.Errorf("期望成功，实际失败: %s", result.ErrorMsg)
		}
		if result.IsOCR {
			t.Error("OCR已禁用，但结果标记为使用了OCR")
		}
	})
}

func TestExtractResume_StructuredFields(t *testing.T) {
	ctx := context.Background()

	req := &ResumeExtractionRequest{
		FilePath:  testPDFPath(t),
		EnableOCR: true,
		Language:  "en",
	}

	result, err := ExtractResume(ctx, req)
	if err != nil {
		t.Fatalf("简历解析失败: %v", err)
	}

	if !result.Success {
		t.Fatalf("期望成功，实际失败: %s", result.ErrorMsg)
	}

	t.Run("structured_fields_populated", func(t *testing.T) {
		field := result.Structured
		if field.Email != "candidate@example.invalid" {
			t.Fatalf("unexpected extracted email: %q", field.Email)
		}
		if field.Email != "" {
			if !strings.Contains(field.Email, "@") {
				t.Errorf("邮箱格式不正确: %s", field.Email)
			}
		}
	})
}

func TestExtractResume_Error(t *testing.T) {
	ctx := context.Background()

	t.Run("empty_file_path", func(t *testing.T) {
		req := &ResumeExtractionRequest{FilePath: ""}
		result, err := ExtractResume(ctx, req)
		if err == nil {
			t.Error("空路径：期望返回错误，实际无错误")
		}
		if result.Success {
			t.Error("空路径：期望失败，实际成功")
		}
		if result.ErrorMsg == "" {
			t.Error("空路径：未返回错误信息")
		}
	})

	t.Run("file_not_exist", func(t *testing.T) {
		req := &ResumeExtractionRequest{FilePath: "/path/does/not/exist.pdf"}
		result, err := ExtractResume(ctx, req)
		if err == nil {
			t.Error("文件不存在：期望返回错误，实际无错误")
		}
		if result.Success {
			t.Error("文件不存在：期望失败，实际成功")
		}
		if result.ErrorMsg == "" {
			t.Error("文件不存在：未返回错误信息")
		}
	})

	t.Run("unsupported_format", func(t *testing.T) {
		req := &ResumeExtractionRequest{FilePath: "/path/to/file.txt"}
		result, err := ExtractResume(ctx, req)
		if err == nil {
			t.Error("不支持的格式：期望返回错误，实际无错误")
		}
		if result.Success {
			t.Error("不支持的格式：期望失败，实际成功")
		}
	})
}

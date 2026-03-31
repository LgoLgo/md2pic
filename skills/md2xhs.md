# md2xhs — Markdown 转小红书图片

将指定 Markdown 文件导出为小红书格式（3:4 多页分页）PNG 图片。

## 使用方式

```
/md2xhs <file.md> [output-dir]
```

- `file.md`：要转换的 Markdown 文件路径（必填，支持相对路径）
- `output-dir`：输出目录（可选，默认为 file.md 所在目录）

## 前置条件

需要全局安装 md2pic CLI：
```bash
npm install -g md2pic
# 或从源码安装：
# cd ~/path/to/md2pic && npm link
```

## 实现

When this skill is invoked:

1. Parse the args to extract the markdown file path and optional output directory
2. Resolve the file path to absolute path using the current working directory
3. Check if the file exists using the Bash tool: `test -f "<file>" && echo "exists" || echo "not found"`
4. If not found, tell the user the file was not found and stop
5. Determine output directory: use provided dir if given, otherwise use the directory containing the input file (dirname)
6. Run: `md2pic "<file>" "<outDir>" --xhs`
7. If the command fails with "command not found", show: "请先安装 md2pic：npm install -g md2pic"
8. On success, list the generated PNG files: `ls "<outDir>"/*.png 2>/dev/null || echo "no PNG files found"`
9. Report how many images were generated and their paths

# 管理后台导入

机构管理后台提供 CSV 选择、表头校验、数据预览、导入提交和历史查询。浏览器会把 CSV 转换为 JSON 后调用与系统接入相同的批量导入 API；服务器仍会完整复验数据。

## 授予成员权限

机构 owner 或有成员管理权限的管理员可以在成员设置中开启“允许数据导入”。该开关对应 `can_import_data`，不会同时授予审核、成员管理或凭证管理权限。

以下角色无需单独开启：

- 平台管理员 `platform_admin`
- 机构 `owner`
- 机构 `admin`

## CSV 要求

单个文件最多 500 行。论文必须提供 `title` 和 `doi`；学者必须提供 `external_id` 和 `name`。

常用论文列：

```text
title,doi,publish_year,paper_type,language,abstract,journal_name,publish_date,citation_count,pages,link,keywords
```

常用学者列：

```text
external_id,name,avatar,college,title,lab,office,email,phone,bio,join_year,research_directions,education,achievements,research_timeline,letter_index,subjects,subject_codes,paper_dois
```

`keywords`、`research_directions`、`education`、`achievements`、`research_timeline`、`subjects`、`subject_codes` 和 `paper_dois` 等数组字段，在 CSV 单元格中应填写合法 JSON 数组，例如：

```csv
external_id,name,research_directions,paper_dois
HR-00042,示例学者,"[""合成生物学"",""生物信息学""]","[""10.1000/example.1""]"
```

## 导入后的处理

提交后请在“导入历史”中检查：

- 批次总体状态和成功、待审核、失败数量。
- 每一行的 `created/updated/unchanged/pending/error` 结果。
- 校验错误、审核状态和审核意见。

公有多机构模式中的待审核记录不会提前覆盖正式数据。私有单机构模式在校验通过后直接生效，但同样保留完整审计记录。

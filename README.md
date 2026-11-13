# 今天吃啥

自己做菜、点菜用的手机网页应用(PWA)。在 iPhone Safari 里"添加到主屏幕"后,像普通 App 一样全屏打开,断网也能用。

- 数据只存在各自手机里,没有后端,不同步。
- 内置家常菜谱,可以编辑、删除、新增。
- 点完菜自动生成买菜清单,并显示分步做法。
- 在"我的"页可以导出、导入 JSON,用来备份或拷给家人。

## 本地预览

项目是纯静态文件,没有构建步骤。PWA 的离线功能要求 HTTPS 或 `localhost`,所以用本地服务器打开:

```
python -m http.server 8080
```

然后访问 `http://localhost:8080/`。

## 目录

```
index.html            页面入口
manifest.webmanifest  PWA 配置
sw.js                 离线缓存
css/                  样式
js/                   脚本
data/dishes.json      内置菜谱
covers/               内置菜品封面(240px webp)
icons/                应用图标
tools/                生成内置数据的一次性脚本
```

## 数据来源

- 菜谱文字:[Anduin2017/HowToCook](https://github.com/Anduin2017/HowToCook)(Unlicense)。
- 部分封面:[king-jingxiang/HowToCook](https://github.com/king-jingxiang/HowToCook)(MIT)的菜谱图,以及 HowToCook 原仓库的成品图。

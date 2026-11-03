# リズムキッチン セットアップレポート

## 作ったファイルの一覧と役割

```
rhythm-kitchen/
├── index.html          ← ここを開くだけで遊べます
├── css/
│   └── style.css       ← 全画面のデザイン（大きな文字・高コントラスト・iPhone対応）
├── js/
│   ├── audio.js        ← Web Audio API による音管理（クリック音・切り音・チン！音）
│   └── game.js         ← ゲームのすべてのロジック（画面遷移・食材の動き・タイミング判定）
├── images/
│   └── .gitkeep        ← 画像フォルダ（PNG を追加すると自動で使われます）
└── setup_report.md     ← このファイル
```

## 各ファイルの役割詳細

| ファイル | 役割 |
|---|---|
| `index.html` | 3 つの画面（スタート・ゲーム・完成）の HTML 骨格。BGM の `<audio>` タグがコメントで準備済み |
| `css/style.css` | iPhone 縦画面優先のレイアウト。文字は最小 0.82rem〜最大 2.6rem。高コントラスト配色 |
| `js/audio.js` | Web Audio API で全音を合成。iOS Safari のタップロック解除あり。`loadBGM(url)` で曲差し替え可能 |
| `js/game.js` | 80 BPM・90 秒のゲームループ。食材 8 種を 3 秒おきに出現。ヒット判定は ±220ms で「きれい」、±550ms で「大きめ」 |

## 画像の差し替え方法

`images/` フォルダに同名の PNG を入れると自動で使われます（なければ絵文字の丸が表示されます）。

| ファイル名 | 推奨サイズ | 用途 |
|---|---|---|
| `ingredient_iwashi.png` | 512×512 | イワシ |
| `ingredient_tamanegi.png` | 512×512 | 玉ねぎ |
| `ingredient_ninniku.png` | 512×512 | にんにく |
| `ingredient_tomato.png` | 512×512 | トマト |
| `ingredient_olive.png` | 512×512 | オリーブ |
| `ingredient_lemon.png` | 512×512 | レモン |
| `ingredient_paseri.png` | 512×512 | パセリ |
| `ingredient_oliveoil.png` | 512×512 | オリーブオイル |
| `dish_psari_plaki.png` | 1024×1024 | 完成皿（完成画面） |

## BGM（音楽）の差し替え方法

1. `audio/bgm.mp3`（または `.ogg`）を配置
2. `js/game.js` の `startGame()` 内にある以下のコメントを解除:
   ```javascript
   // Audio.loadBGM('audio/bgm.mp3').then(() => Audio.startBGM());
   ```

## パソコンのブラウザで試す方法

### 方法 A：VS Code の Live Server（推奨）
1. VS Code で `rhythm-kitchen` フォルダを開く
2. 拡張機能「Live Server」をインストール（未インストールの場合）
3. `index.html` を右クリック → **Open with Live Server**
4. ブラウザが自動で開きます

### 方法 B：Python でローカルサーバーを立てる
```bash
cd rhythm-kitchen
python3 -m http.server 8080
```
→ ブラウザで `http://localhost:8080` を開く

### 方法 C：ファイルを直接開く
```
ファイル → index.html をブラウザにドラッグ
```
※ Web Audio API は `file://` でも動きますが、一部ブラウザで制限がある場合は方法 A か B を使ってください。

### iPhone Safari で試す方法
1. 方法 A か B でサーバーを起動
2. Mac と iPhone を同じ Wi-Fi に接続
3. Mac のターミナルで `ipconfig getifaddr en0` を実行してIPアドレスを確認
4. iPhone Safari で `http://[そのIPアドレス]:8080` にアクセス

## GitHub Pages での公開方法
```bash
cd rhythm-kitchen
git init
git add .
git commit -m "初回コミット: リズムキッチン骨組み"
# GitHub でリポジトリを作成後:
git remote add origin [リポジトリURL]
git push -u origin main
```
→ GitHub リポジトリの Settings → Pages → Source: `main` ブランチを選択

## ゲームのしくみ（技術メモ）

- テンポ: 80 BPM（1 拍 = 750 ms）
- 食材の移動: 出現から 1500 ms（2 拍）でまな板中央に到達
- 食材の間隔: 3000 ms（4 拍）に 1 個
- ゲーム時間: 90 秒（タイマーバーで表示）
- 判定: タイムスタンプの差で計算（位置ではなく時間で判定）

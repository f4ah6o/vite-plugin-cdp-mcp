n-cdp-mcp 開発要CDP 特化	

##  概要
* Vite の **dev サーバー**に **MCP Server** を生やし**Chrome DevTools Protocol (CDP)** に直結して開発時に必要な情報を取得・操作する。
* 目的ユーザーが通常ブラウザからピペして持ってくる **console 出力** や **Network ベント**軽い **Runtime 評価** を MCP の tools として提供する。
* 対象**Chrome 限定*`--remote-debugging-port=9222` 起動が前提	。  
* 本番用途は想定しな**dev only**	。

##  MVv0.1	
* 提供ツー
  * **cdp.console.tail**
    * 直近の `console.log/debug/info/warn/error` を取N 件	
  * **cdp.network.tail**
    * 直近のリエURL/メソド/起点など	を取N 件	
  * **cdp.runtime.eval**
    * 任意の JS を対象ブで `Runtime.evaluate` 実行し戻り値と `console.log` の内容を返す
* ブ選択
  * 既定は `http://localhost:5173` で前方一致する **page** を優先
  * 見つからなければ `Target.createTarget({ url })` で生成して接続

## ️ ードマプ
* **v0.2**
  * **cdp.console.history**過去グバフの検索/フィ
  * **cdp.network.inspect**レポン・ヘダ・ング詳細
  * ブ選択の拡title/URL 正規表現複数ブ管理	
* **v0.3**
  * **cdp.dom.query**DOM.getDocument + querySelectorAllForNode で要素情報を安全に収集
  * **cdp.storage.local**Storage API 参照・編集
  * **cdp.coverage**JS/CSS Coverage の取得
* **v1.0**
  * 安定 APICL`npx vite-cdp-mcp`	ドキメント/サンプ整備

## ⚙️ 技術構成
* Vite プラグン`vite-plugin-cdp-mcp`
* MCP`@modelcontextprotocol/sdk` の **Streamable HTTP** を `/mcp` に公開
* CDP`chrome-remote-interface` で `ws://localhost:9222` に接続
* 依存`@modelcontextprotocol/sdk`, `chrome-remote-interface`, `zod任意で `hono` による `/health`	

##  セキリィ/運用
* 9222 はーカ専用。外部公開しない。FW でブ。
* MCP エンドポント `/mcp` も dev サーバー内のトン/公開禁止	。
* 破壊的操作は MVP では提供しな読み取り軽い評価のみに限定	。

## ▶️ 利用手開発者	
* Chrome を **リートデバグ**で起動
  * macOS`/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222`
  * Windowsショートカトのリン先に `--remote-debugging-port=9222` 追加
  * Linux`google-chrome --remote-debugging-port=9222`
* Vite 起動`pnpm dev`
* MCP ラアント設定Cursor など	
  ```json
  {
    "mcpServers": {
      "vite-plugin-cdp-mcp": { "url": "http://localhost:5173/mcp" }
    }
  }

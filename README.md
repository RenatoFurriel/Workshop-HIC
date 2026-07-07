# Workshop "O Novo Profissional de GRC TI" — ITXPRO

Página de captura e dashboard de leads do workshop gratuito da ITXPRO.

## Arquivos

- **`lp-workshop-grc-ti-v2.html`** — Landing page completa (standalone), na direção visual "Sala de Controle" (grafite + laranja `#FF5C00`). Pode ser hospedada direto (ex.: GitHub Pages) e/ou embutida via iframe.
- **`lp-workshop-grc-ti-b.html`** — Versão curta da landing page (3 dobras: Hero, Workshop, Mentor), mesma base visual.
- **`lp-workshop-grc-ti-v2-greatpages.html`** — Versão em fragmento para colar no bloco HTML do GreatPages (CSS isolado em `#lpx-root`, imagens embutidas como data URI, 100% ASCII). Gerada a partir da LP pelo script abaixo.
- **`build_greatpages.py`** — Gera a versão GreatPages a partir da LP. Uso: `python3 build_greatpages.py` (requer Pillow).
- **`dashboard-leads-grcti.html`** — Painel de leads (interno, `noindex`). Lê a aba "Dash" da planilha do Respondi publicada como CSV (sem dados de contato) e mostra volume, aquisição/UTMs, qualidade/ICP, perfil e funil. Auto-refresh de 5 min.
- **`marca-itxpro-branco.png`** — Logo oficial (header).
- **`roberto-circulo.png`** — Foto do mentor (círculo com fundo laranja).

O formulário de inscrição aponta para o Respondi (`FORM_URL` no `<script>` da LP).

> Os documentos internos do projeto (transcrições, copy, briefing, estratégia) são mantidos apenas localmente e não fazem parte deste repositório.

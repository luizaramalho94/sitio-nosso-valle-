# Nosso Valle Studio

Editor de reels do **Sítio Nosso Valle** — refúgio na Serra da Mantiqueira, Bueno Brandão/MG.
Você escolhe um template pronto, adiciona fotos e vídeos do sítio e o app monta um reel vertical (9:16) com música, textos, transições e filtros, pronto para Instagram e TikTok.

👉 **Abrir o app:** https://luizaramalho94.github.io/sitio-nosso-valle-/

- Funciona direto no navegador, **sem login e sem servidor**: seus vídeos nunca saem do celular.
- Funciona **sem internet** depois da primeira visita.
- Exporta **MP4 1080×1920, 30 fps**.

---

## Como abrir no iPhone

1. Abra o **Safari** (precisa ser o Safari) e acesse o link acima.
2. Espere a página carregar uma vez com internet — a partir daí ela também abre offline.

## Como adicionar à Tela de Início (vira um “app”)

1. No Safari, com o app aberto, toque no botão **Compartilhar** (quadrado com a seta para cima).
2. Role a lista e toque em **“Adicionar à Tela de Início”**.
3. Confirme o nome **Valle Studio** e toque em **Adicionar**.
4. Pronto: o ícone verde com a serra aparece junto dos seus apps e abre em tela cheia.

> Use sempre pelo ícone da Tela de Início: assim o iPhone guarda seus projetos com mais segurança.

## Como criar um reel

1. **Escolha um template** na tela inicial. Dá para filtrar por categoria (Natureza, Hospedagem, Glamping, Pôr do sol, Promoção, Depoimento, Fim de semana) e por duração.
2. Ao tocar no template você vê **quantos clipes ele pede** e **a duração de cada um**.
3. Toque em **“Escolher fotos e vídeos”** e selecione na galeria, **na ordem** em que quer que apareçam. O app preenche os espaços em ordem.
4. No editor:
   - **Toque num clipe** da linha do tempo para trocar a mídia, mover para a esquerda/direita, escolher o **trecho** do vídeo, a **velocidade** (0,5x lento, 1x, 2x) e o **volume do som original**. Em fotos, ligue/desligue o movimento suave (Ken Burns).
   - **Textos:** edite as frases, escolha entre 6 estilos de letra, 6 animações de entrada, cor, fundo, tamanho, posição na tela e em qual cena aparece.
   - **Filtro:** Verde da serra, Luz dourada, Terra, Creme suave, Neblina, Noite azul, P&B quente — com intensidade ajustável.
   - **Música:** 6 trilhas próprias do app ou **seu próprio áudio**. Ajuste o volume, onde a música começa e ligue **“Cortes no ritmo da batida”** para os cortes caírem no tempo da música (o app detecta o ritmo do seu áudio sozinho).
   - **Marca:** liga a marca d’água com o seu @ e/ou logo. Configure uma vez em ⚙️ Ajustes e ela vale para todos os projetos.
5. Toque em **Exportar**. Deixe a tela ligada e o app aberto — leva mais ou menos o tempo do vídeo.
6. Toque em **“Compartilhar ou salvar no iPhone”** → **“Salvar vídeo”** (vai para a galeria) ou mande direto para o Instagram/TikTok. Também existe o botão **“Baixar arquivo”**.

Os projetos são salvos automaticamente no aparelho e aparecem em **“Continuar editando”**.

### Dicas

- Vídeos gravados em 1080p ou 4K funcionam; vídeos muito longos (vários minutos em 4K) deixam a importação mais lenta. Prefira cortes curtos.
- Se um clipe ficar vazio, ele aparece com uma ilustração da serra no lugar.
- O iPhone pode apagar dados de sites que ficam muito tempo sem uso. Exporte os reels importantes e guarde na galeria.

---

## Templates incluídos (14)

| Template | Categoria | Clipes |
|---|---|---|
| Bem-vindo ao Valle | Hospedagem | 6 |
| Café da manhã na serra | Hospedagem | 7 |
| Pôr do sol | Pôr do sol | 5 (câmera lenta) |
| Tour da casa | Hospedagem | 8 |
| Glamping sob as estrelas | Glamping | 5 |
| Fim de semana perfeito | Fim de semana | 8 |
| Reserve sua data | Promoção | 5 + cartão de reserva |
| Antes e depois | Natureza | 2 (cortina) |
| Colagem 3 vídeos | Natureza | 3 (tela dividida) |
| Contagem regressiva para o feriado | Promoção | 4 + cartão |
| Depoimento de hóspede | Depoimento | 3 (foto emoldurada) |
| Momentos rápidos | Fim de semana | 12 (cortes na batida) |
| Respira, é serra | Natureza | 4 |
| Promoção de temporada | Promoção | 3 + cartão |

## Como adicionar ou mudar templates

Todos os templates ficam em um único arquivo: [`docs/templates/templates.json`](docs/templates/templates.json).
Dá para editar pelo próprio site do GitHub (abra o arquivo → ícone de lápis → “Commit changes”). Em 1–2 minutos o app publicado é atualizado sozinho.

Cada template tem este formato:

```jsonc
{
  "id": "meu-template",              // identificador único, sem espaços
  "name": "Nome que aparece",
  "category": "Natureza",            // uma das categorias da lista "categories"
  "description": "Frase curta",
  "music": "amanhecer",              // amanhecer | cafe | por-do-sol | noite | fim-de-semana | ritmo
  "filter": "serra",                 // nenhum | serra | dourada | terra | creme | neblina | noite | pb
  "art": "day",                      // ilustração da prévia: dawn | day | sunset | night | mist | interior
  "beatSync": true,                  // ajusta as cenas ao ritmo da música
  "scenes": [
    { "dur": 2.5, "transition": "fade", "effect": "push" },
    { "dur": 2.0, "transition": "zoom", "speed": 0.5 },
    { "dur": 3.0, "transition": "fade", "layout": "card", "bg": "#2f4a36" }
  ],
  "texts": [
    { "scene": 0, "text": "Olá!", "style": "elegante", "anim": "subir", "y": 0.5, "size": 1, "color": "#ffffff" }
  ]
}
```

**Cenas (`scenes`)**

| Campo | Valores |
|---|---|
| `dur` | duração em segundos |
| `transition` | entrada da cena: `cut` (corte seco), `fade`, `zoom`, `slide`, `flash` (flash branco), `blur` (desfoque), `wipe` (cortina) |
| `layout` | `full` (1 clipe, padrão), `split2` (2 clipes empilhados), `split3` (3 faixas), `beforeafter` (2 clipes com cortina), `frame` (1 foto emoldurada), `card` (cartão sem mídia, cor em `bg`) |
| `effect` | `push` (aproximação lenta), `punch` (pulso no corte), `kenburns` (zoom/pan em vídeo — fotos já têm por padrão) |
| `speed` | `0.5` (câmera lenta), `1`, `2` |

**Textos (`texts`)**

| Campo | Valores |
|---|---|
| `scene` | índice da cena (a primeira é 0); `span` faz o texto durar várias cenas; `delay` atrasa a entrada (segundos) |
| `style` | `elegante`, `classica`, `moderna`, `manuscrita`, `impacto`, `suave` |
| `anim` | `aparecer`, `subir`, `zoom`, `digitar`, `deslizar`, `nenhuma` |
| `y` | posição vertical de 0 (topo) a 1 (base) · `align`: `left`, `center`, `right` |
| `size` | 1 = normal · `color`: cor em hexadecimal · `bg`: `true` para faixa clara atrás |

---

## Músicas e licenças

As 6 trilhas — **Amanhecer na Serra, Café com Viola, Pôr do Sol Dourado, Noite Estrelada, Fim de Semana e Ritmo do Valle** — são **compostas por código** dentro do próprio app ([`docs/js/music-worker.js`](docs/js/music-worker.js)): violão sintetizado, piano, pads e batidas gerados matematicamente. Nenhuma gravação de terceiros é usada. Elas são dedicadas ao **domínio público (CC0 1.0)** — podem ser usadas em reels, anúncios e qualquer outro lugar, sem atribuição e sem risco de bloqueio por direitos autorais.

Ao importar seu próprio áudio, use apenas músicas que você tem direito de usar.

- Fontes: Playfair Display, Cormorant Garamond, Montserrat, Caveat, Bebas Neue e Josefin Sans — [SIL Open Font License 1.1](https://openfontlicense.org).
- [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) — licença MIT ([docs/vendor/mp4-muxer.LICENSE](docs/vendor/mp4-muxer.LICENSE)).

---

## Detalhes técnicos

- HTML, CSS e JavaScript puros (sem etapa de build), tudo em [`docs/`](docs/).
- **Renderização:** Canvas 2D desenha cada quadro (layouts, Ken Burns, transições, filtros por camadas de mistura, textos e marca d’água).
- **Exportação:**
  1. **WebCodecs** (`VideoEncoder` H.264 + `AudioEncoder` AAC) + mp4-muxer, no Safari 26 ou mais recente (e Chrome).
  2. Se o navegador não tiver `AudioEncoder`, usa **MediaRecorder** do canvas, que no Safari grava MP4 (H.264/AAC) nativamente — iOS 14.5+.
  O áudio (música + som original dos clipes) é mixado com `OfflineAudioContext`. Os vídeos são decodificados pelo próprio Safari (hardware), por isso a exportação acontece em tempo real.
- **Batida:** as trilhas próprias têm BPM exato; para áudio importado o app estima BPM e a primeira batida por autocorrelação de ataques.
- **Armazenamento:** projetos, mídias e ajustes ficam no IndexedDB do aparelho.
- **Offline:** service worker (`docs/sw.js`) guarda todos os arquivos do app. Depois de mudar qualquer arquivo, rode `python3 tools/gerar-sw.py` (o GitHub Actions já faz isso na publicação).
- **Publicação:** o workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) publica a pasta `docs/` no branch `gh-pages` a cada mudança no `main`.

### Rodar no computador

```bash
npx http-server docs -p 8080
# abra http://localhost:8080
```

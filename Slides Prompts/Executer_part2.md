# Prompt do Executor — Parte 2: Regras por tipo, navegação, output

## DRAFT v1 (continuação)

---

## Regras por tipo de slide

### static

O tipo mais simples. Conteúdo fixo, sem interação.

**Estrutura típica:**
```html
<div class="sl-layout-full">
  <h1 class="sl-heading">Título</h1>
  <p class="sl-body">Texto explicativo...</p>
  <div class="sl-callout">
    <span class="sl-badge">Definição</span>
    <p class="sl-body">Conteúdo em destaque...</p>
  </div>
</div>
```

**Bons patterns:**
- Heading + callout com definição/fórmula central — para conceitos-chave
- Heading + body + visual SVG — para explicações com diagrama
- Split com texto à esquerda e visual à direita — para conceito + ilustração
- Heading + lista visual de pontos-chave — para resumos

**Regras:**
- Cada slide static tem exatamente UM heading
- Se tem callout, o callout é o elemento de maior destaque visual (não o corpo de texto)
- Se tem visual SVG, o SVG ocupa pelo menos 40% da área útil
- Texto corpo nunca está sozinho sem heading — há sempre hierarquia

### reveal

Conteúdo que aparece por etapas. Cada clique no slide revela o próximo fragment.

**Estrutura típica:**
```html
<div class="sl-layout-full">
  <h1 class="sl-heading">Título</h1>
  <div class="sl-fragment" data-fragment-index="1">
    <p class="sl-body">Primeiro ponto...</p>
  </div>
  <div class="sl-fragment" data-fragment-index="2">
    <p class="sl-body">Segundo ponto...</p>
  </div>
  <div class="sl-fragment" data-fragment-index="3">
    <div class="sl-callout">
      <p class="sl-body">Conclusão em destaque...</p>
    </div>
  </div>
</div>
```

**Regras:**
- O heading é SEMPRE visível (nunca é fragment). É o contexto que o aluno vê enquanto espera pelo primeiro clique.
- Cada fragment tem `data-fragment-index` com a ordem (1, 2, 3...)
- Mínimo 2 fragments, máximo 6 por slide
- Cada fragment faz sentido por si — não é uma palavra, é uma ideia completa
- Fragments podem conter qualquer primitivo: texto, callout, SVG, lista
- O último fragment é frequentemente o mais importante — a conclusão, a fórmula, o destaque final
- Se um fragment é um visual SVG, esse fragment é único (não misturar SVG + texto no mesmo fragment)

**Anti-patterns:**
- Fragment com uma única palavra ou frase curta demais — cada fragment deve acrescentar uma ideia
- Heading como fragment — o heading deve estar sempre visível como contexto
- 7+ fragments — demasiados cliques, o aluno perde a paciência. Simplifica ou divide em 2 slides
- Todos os fragments são texto — mistura texto com visuais para manter interesse

### quiz

Pergunta(s) que o aluno responde com feedback imediato.

**Estrutura — multiple_choice:**
```html
<div class="sl-layout-full" data-slide-type="quiz">
  <div class="sl-quiz">
    <h2 class="sl-quiz-question">Texto da pergunta?</h2>
    <div class="sl-quiz-options">
      <button class="sl-quiz-option" data-quiz-option="A" data-feedback="Explicação de porquê está errado.">
        Opção A
      </button>
      <button class="sl-quiz-option" data-quiz-option="B" data-correct="true" data-feedback="Correto! Explicação.">
        Opção B
      </button>
      <button class="sl-quiz-option" data-quiz-option="C" data-feedback="Explicação de porquê está errado.">
        Opção C
      </button>
      <button class="sl-quiz-option" data-quiz-option="D" data-feedback="Explicação de porquê está errado.">
        Opção D
      </button>
    </div>
    <div class="sl-quiz-feedback" data-feedback-correct>Mensagem quando acerta.</div>
    <div class="sl-quiz-feedback" data-feedback-wrong>Mensagem quando erra.</div>
    <div class="sl-quiz-score"></div>
  </div>
</div>
```

**Estrutura — true_false:**
```html
<div class="sl-layout-full" data-slide-type="quiz">
  <div class="sl-quiz">
    <h2 class="sl-quiz-question">Afirmação para avaliar.</h2>
    <div class="sl-quiz-options">
      <button class="sl-quiz-option" data-quiz-option="true" data-correct="true" data-feedback="Explicação.">
        Verdadeiro
      </button>
      <button class="sl-quiz-option" data-quiz-option="false" data-feedback="Explicação.">
        Falso
      </button>
    </div>
    <div class="sl-quiz-feedback" data-feedback-correct>Mensagem quando acerta.</div>
    <div class="sl-quiz-feedback" data-feedback-wrong>Mensagem quando erra.</div>
  </div>
</div>
```

**Regras:**
- Cada opção TEM de ter `data-feedback` com explicação — nunca só "errado"
- O feedback das opções erradas explica PORQUÊ está errado e qual é o erro de raciocínio
- O feedback da opção correta reforça a aprendizagem — não é só "correto!"
- `data-correct="true"` marca a(s) opção(ões) correta(s) — o viewer lê isto
- Multiple choice: 3-4 opções, exatamente 1 correta
- True/false: sempre 2 opções (Verdadeiro / Falso)
- A pergunta é clara e sem ambiguidade
- As opções erradas refletem erros reais que os alunos cometem — não são absurdas
- Se o quiz tem múltiplas perguntas, cada pergunta está dentro do seu próprio `.sl-quiz`
- O `data-slide-type="quiz"` no container principal permite ao viewer identificar este slide como quiz

**Quizzes com múltiplas perguntas:**
```html
<div class="sl-layout-full" data-slide-type="quiz">
  <div class="sl-quiz" data-quiz-index="1">
    <!-- primeira pergunta -->
  </div>
  <div class="sl-quiz" data-quiz-index="2">
    <!-- segunda pergunta (pode ser fragment) -->
  </div>
  <div class="sl-quiz-score" data-quiz-total="2"></div>
</div>
```

Perguntas múltiplas podem ser fragments — a segunda pergunta aparece depois de responder à primeira.

**Navegação condicional:**
Se o slide de planner indica `reinforcement_slide`, adiciona o atributo ao container:
```html
<div class="sl-layout-full" data-slide-type="quiz" data-reinforcement="s4b">
```
O viewer lê `data-reinforcement` e, se o aluno errar, mostra o slide `s4b` antes de avançar.

### interactive

O tipo mais livre. SVG, HTML, JavaScript, KaTeX, Chart.js — tudo dentro do canvas do slide.

**Estrutura típica:**
```html
<div class="sl-layout-full" data-slide-type="interactive">
  <h1 class="sl-heading">Título do explorador</h1>
  <div class="sl-interactive">
    <!-- SVG, canvas, ou HTML do visual interativo -->
  </div>
  <div class="sl-controls">
    <div class="sl-slider-row">
      <span class="sl-label">Cateto a</span>
      <input type="range" min="1" max="10" value="3" step="1">
      <span class="sl-body">3</span>
    </div>
  </div>
  <div class="sl-info-grid">
    <div class="sl-info-card">
      <span class="sl-caption">Área a²</span>
      <span class="sl-body">9</span>
    </div>
  </div>
  <script>
    // lógica de interatividade
  </script>
</div>
```

**Regras:**
- O heading é sempre visível e está fora do `.sl-interactive`
- O visual principal (SVG, canvas) vive dentro de `.sl-interactive`
- Controlos (sliders, botões) vivem dentro de `.sl-controls`, abaixo do visual
- Info cards (valores calculados) vivem dentro de `.sl-info-grid`
- Scripts vão no fim, depois de todo o HTML
- Usa CSS variables para cores — mesmo dentro de SVG, usa `var(--sl-color-accent)` para fills e strokes quando possível. Para SVG onde CSS variables não funcionam (ex: em atributos), usa as mesmas cores hex que correspondem às variables.
- Todo o estado vive em JavaScript — sem dependências externas além de KaTeX e Chart.js
- O interativo deve ser autoexplicativo — sem instruções longas. Se precisa de explicação, um `.sl-caption` curto basta.
- Sliders têm `step` definido para emitir valores redondos — sem floats nos displays
- Números mostrados ao aluno passam SEMPRE por `Math.round()` ou `.toFixed(n)`

**SVG dentro de slides:**
- ViewBox flexível — adapta ao conteúdo, não uses 680px fixo (isso é do Visualizer, não dos slides)
- O SVG deve ocupar o espaço disponível dentro de `.sl-interactive` com `width="100%"`
- Texto em SVG: font-size mínimo 14px (vai ser escalado no slide)
- Usa `fill="var(--sl-color-primary)"` quando possível; fallback para hex equivalente quando CSS variables não funcionam em atributos SVG
- Linhas e bordas: stroke-width 1-2px (mais fino desaparece na projeção)

**Chart.js dentro de slides:**
- Canvas dentro de um div com height explícito e `position: relative`
- `responsive: true, maintainAspectRatio: false` nas options
- Cores: hex hardcoded que corresponda às CSS variables (canvas não resolve CSS variables)
- Custom HTML legend (desativar a default do Chart.js)
- Font sizes maiores que o default — mínimo 14px para labels, 12px para ticks

**KaTeX dentro de slides:**
- Carregar CSS e JS via CDN
- Renderizar após o DOM estar pronto — no `<script>` final
- `displayMode: true` para fórmulas centradas, `false` para inline
- Tamanho adequado para projeção — KaTeX renderiza grande por default, o que é bom

---

## Navegação condicional

Slides de reforço são condicionais — só aparecem se o aluno errou o quiz associado.

**Como funciona:**
1. O slide quiz tem `data-reinforcement="s4b"` no container principal
2. O slide de reforço tem `data-slide-id="s4b"` e `data-conditional="true"`
3. O viewer lê estes atributos: se o aluno errou, mostra s4b; se acertou, salta para o próximo slide normal

**Estrutura do slide de reforço:**
```html
<div class="sl-layout-full" data-slide-id="s4b" data-conditional="true">
  <span class="sl-badge">Vamos rever</span>
  <h1 class="sl-heading">Título do reforço</h1>
  <p class="sl-body">Re-explicação com abordagem diferente...</p>
</div>
```

**Regras:**
- O slide de reforço DEVE usar uma abordagem diferente do slide original — outra analogia, outro visual, outra perspetiva. Não é repetição.
- Inclui um badge "Vamos rever" ou similar para o aluno saber que é reforço
- Não inclui novo quiz — é só a re-explicação. O aluno avança automaticamente para o próximo conteúdo.
- Mantém o tom encorajador — "vamos ver de outra forma" não "erraste"

---

## Anti-patterns — o que corrigir mentalmente antes de gerar

Antes de gerar o HTML, verifica estas condições:

**Texto:**
- Há mais de 6 linhas de texto corpo? → Reduz. Move conteúdo para outro slide.
- Há texto abaixo de 18px? → Aumenta. Se não cabe, há conteúdo a mais.
- O heading está ausente? → Adiciona. Todo o slide tem heading.
- Há duas ideias a competir por atenção? → Separa. Um foco por slide.

**Layout:**
- As duas colunas do split são ambas texto puro? → Usa layout full em vez de split.
- O conteúdo ultrapassa a safe area (80px de margem)? → Reduz ou reorganiza.
- Um elemento SVG ou interativo ocupa menos de 30% da área? → Aumenta. Se é visual, dá-lhe espaço.

**Fragments:**
- Há mais de 6 fragments? → Simplifica ou divide em 2 slides.
- O heading é um fragment? → Retira. O heading é sempre visível.
- Um fragment tem uma só palavra? → Agrupa com outro. Cada fragment é uma ideia.

**Quiz:**
- Uma opção errada não tem feedback explicativo? → Adiciona. O aluno precisa de saber porquê.
- As opções erradas são absurdas? → Reescreve. Devem refletir erros reais de raciocínio.
- A pergunta é ambígua? → Clarifica. Só pode haver uma interpretação.

**Interativos:**
- Um número mostrado tem casas decimais desnecessárias? → Arredonda com Math.round() ou toFixed().
- O interativo precisa de instruções longas para ser usado? → Simplifica. Deve ser intuitivo.
- O slider não tem step definido? → Define. Sem floats nos displays.

---

## Output

O executor devolve UM bloco de HTML por slide. Sem JSON wrapper, sem metadata separada — toda a informação estrutural está nos data-attributes do HTML.

**Data-attributes usados:**

| Atributo | Onde | Propósito |
|---|---|---|
| `data-slide-type` | Container principal | Tipo: `static`, `reveal`, `quiz`, `interactive` |
| `data-slide-id` | Container principal | ID do slide (ex: `s1`, `s4b`) |
| `data-fragment-index` | Elementos fragment | Ordem de revelação (1, 2, 3...) |
| `data-quiz-option` | Botões de opção | Identificador da opção (A, B, C, D ou true/false) |
| `data-correct` | Botão da opção correta | `"true"` na opção correta |
| `data-feedback` | Botões de opção | Texto de feedback para essa opção |
| `data-feedback-correct` | Div de feedback | Mensagem global quando acerta |
| `data-feedback-wrong` | Div de feedback | Mensagem global quando erra |
| `data-quiz-index` | Container de pergunta | Índice da pergunta (para quizzes multi-pergunta) |
| `data-quiz-total` | Container de score | Total de perguntas |
| `data-reinforcement` | Container do quiz | ID do slide de reforço (ex: `s4b`) |
| `data-conditional` | Container do slide de reforço | `"true"` — indica que é condicional |

**Exemplo de output completo para um slide reveal:**
```html
<div class="sl-layout-full" data-slide-type="reveal" data-slide-id="s3">
  <h1 class="sl-heading">A relação entre os lados</h1>
  <div class="sl-layout-split">
    <div class="sl-col">
      <div class="sl-fragment" data-fragment-index="1">
        <p class="sl-body">Se desenharmos um quadrado sobre cada lado do triângulo retângulo...</p>
      </div>
      <div class="sl-fragment" data-fragment-index="2">
        <p class="sl-body">A área do quadrado do cateto <em>a</em> é <strong>a²</strong></p>
        <p class="sl-body">A área do quadrado do cateto <em>b</em> é <strong>b²</strong></p>
      </div>
      <div class="sl-fragment" data-fragment-index="3">
        <div class="sl-callout-accent">
          <p class="sl-body"><strong>a² + b² = c²</strong></p>
          <p class="sl-caption">A soma das áreas dos quadrados dos catetos é igual à área do quadrado da hipotenusa.</p>
        </div>
      </div>
    </div>
    <div class="sl-col">
      <!-- SVG do triângulo com quadrados — atualiza com cada fragment via JS -->
      <svg viewBox="0 0 400 400" width="100%">
        <!-- triângulo e quadrados gerados aqui -->
      </svg>
    </div>
  </div>
</div>
```

**Nota final:** O executor produz todos os slides. As CSS variables e classes pré-definidas são injetadas pelo viewer.
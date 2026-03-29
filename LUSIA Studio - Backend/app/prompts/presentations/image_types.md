# Image Types — Prompt Didáctico

Cada tipo define a ABORDAGEM PEDAGÓGICA da imagem. O prompt do caller (Propósito + Conteúdo + Objectivo) define O QUÊ mostrar. Este bloco define COMO pensar sobre a imagem para que ela ENSINE.

## REGRAS GLOBAIS (aplicam-se a TODOS os tipos)

**Língua:** TODO o texto visível na imagem (labels, legendas, nomes de partes, setas etiquetadas) DEVE estar em **Português de Portugal (PT-PT)**. Nunca inglês, nunca brasileiro. Exemplos: "Núcleo" (não "Nucleus"), "Coração" (não "Heart"), "Célula" (não "Cell"), "Pulmão" (não "Pulmão" com acento brasileiro).

**Rigor didáctico:** A informação na imagem DEVE ser cientificamente/historicamente CORRECTA. Esta imagem vai ser usada por um professor numa aula. Se um organelo está no sítio errado, se uma data histórica está incorrecta, se uma estrutura tem proporções erradas — o professor perde confiança na ferramenta. Verifica os factos antes de gerar.

**Fundo:** SEMPRE branco (#FFFFFF). Sem excepções.

---

## diagram

Tu estás a criar uma ferramenta de compreensão visual. O aluno precisa de VER algo que é difícil de explicar só com texto — uma estrutura complexa, um sistema com partes, um processo com fases, ou um espécime que precisa de ser observado em detalhe.

**A tua missão:** Tornar o complexo compreensível. Cada elemento na imagem existe porque o aluno PRECISA de o ver para entender.

**Princípios didácticos:**
- **Hierarquia visual:** O elemento principal domina o centro. Partes secundárias orbitam à volta. O olho segue um caminho natural — do todo para as partes, do input para o output.
- **Labels são obrigatórios e em PT-PT.** Sem labels, tens formas. Com labels, tens conhecimento. Cada parte relevante deve estar etiquetada com texto legível em português, ligado por linhas de chamada se necessário.
- **Precisão científica é CRÍTICA.** Proporções correctas, cores fiéis à realidade, estruturas anatomicamente/cientificamente correctas. Um diagrama errado é pior que nenhum diagrama. Exemplos de erros comuns a evitar:
  - Célula: mitocôndrias têm dupla membrana, não simples. O RE rugoso tem ribossomas, o liso não.
  - Coração: o ventrículo esquerdo é mais espesso que o direito. As veias pulmonares trazem sangue arterial.
  - Vulcão: a câmara magmática é ABAIXO da superfície, não à superfície.
  - Sistema digestivo: o fígado está à DIREITA do paciente (esquerda do observador).
- **Fundo branco.** O diagrama flutua num fundo limpo (#FFFFFF). Sem cenário, sem decoração.

**Quando usar:**
- Estruturas internas (célula, vulcão, coração, motor)
- Processos com fases visíveis (ciclo da água, fotossíntese, digestão)
- Espécimes (mineral, fóssil, insecto, artefacto)
- Comparações visuais (antes/depois, saudável/doente)
- Qualquer coisa que seria confusa como Rough.js — detalhes reais, camadas, profundidade

**Público:** Alunos do ensino básico e secundário português (10-18 anos). A imagem deve ser acessível mas não infantil. Pensa num manual escolar moderno e bem desenhado.

---

## illustration

Tu estás a criar uma ponte emocional. O aluno precisa de SENTIR algo que o texto sozinho não consegue transmitir — a atmosfera de um lugar, a presença de uma pessoa, a energia de um momento histórico.

**A tua missão:** Transportar o aluno para outro tempo, lugar, ou perspectiva. Criar uma conexão humana com o conteúdo.

**Princípios didácticos:**
- **Precisão histórica/geográfica é CRÍTICA.** Uma aldeia medieval não pode ter arquitectura renascentista. Uma floresta tropical não pode ter árvores temperadas. Os detalhes que tornam ESTE lugar/momento/pessoa únicos são exactamente os que importam. Exemplos de erros a evitar:
  - Descobrimentos: as caravelas portuguesas têm velas latinas (triangulares), não quadradas. A Cruz de Cristo é vermelha.
  - 25 de Abril: os cravos são VERMELHOS, nos canos das G3. Os soldados vestem fardamento militar português dos anos 70.
  - Fernando Pessoa: óculos redondos, chapéu de feltro, bigode fino. NÃO usar barba, cabelo comprido, ou roupa moderna.
  - Época medieval: sem vidros nas janelas, sem electricidade, sem materiais modernos.
- **Presença, não rigidez.** Pessoas devem parecer vivas — a pensar, a agir, a observar. Não retratos estáticos.
- **Energia narrativa.** A composição transmite o que está a acontecer. O aluno deve sentir a tensão, o triunfo, ou a transformação.
- **Fundo branco com cenário mínimo.** O cenário pode existir para dar contexto mas desvanece para branco nas bordas.

**Quando usar:**
- Figuras históricas (Fernando Pessoa, Marie Curie, Vasco da Gama)
- Lugares (castelo medieval, Ágora grega, floresta amazónica)
- Momentos históricos (25 de Abril, Descobrimentos, chegada à Lua)
- Cenas literárias (a casa de Inês Pereira, o naufrágio d'Os Lusíadas)
- Conceitos abstractos que beneficiam de uma cena visual

**Público:** Alunos do ensino básico e secundário português (10-18 anos). A imagem deve criar empatia e memória — "eu lembro-me desta imagem quando penso neste conceito."

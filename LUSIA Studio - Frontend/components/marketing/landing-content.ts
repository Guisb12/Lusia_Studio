export interface CtaItem {
  label: string;
  href: string;
  variant: "primary" | "secondary" | "ghost";
}

export interface OutcomeCard {
  icon: string;
  title: string;
  description: string;
}

export interface WhyPillar {
  icon: string;
  title: string;
  description: string;
}

export interface ArtifactDemo {
  id: string;
  icon: string;
  title: string;
  description: string;
  videoSrc?: string; // Path to video file
}

export const artifactDemos: ArtifactDemo[] = [
  {
    id: "quiz",
    icon: "❓",
    title: "Quiz Interativo",
    description: "Perguntas de escolha múltipla geradas automaticamente com correção instantânea",
    videoSrc: "/artifacts_videos/quiz.webm",
  },
  {
    id: "ficha",
    icon: "📄",
    title: "Ficha de Trabalho",
    description: "Exercícios práticos com espaço para respostas e gabarito incluído",
    videoSrc: "/artifacts_videos/worksheet.webm",
  },
  {
    id: "slides",
    icon: "📊",
    title: "Apresentação",
    description: "Slides prontos para projetar em sala com conteúdo estruturado",
    videoSrc: "/artifacts_videos/slides.webm",
  },
  {
    id: "teste",
    icon: "📝",
    title: "Teste de Avaliação",
    description: "Avaliação completa com diversos tipos de perguntas e critérios de correção",
    videoSrc: "/artifacts_videos/diagram.webm",
  },
  {
    id: "resumo",
    icon: "📑",
    title: "Resumo de Matéria",
    description: "Síntese dos conceitos-chave para revisão rápida antes de exames",
    videoSrc: "/artifacts_videos/note.webm",
  },
];

export interface DemoStep {
  step: number;
  title: string;
  description: string;
}

export interface OperationsTab {
  id: string;
  icon: string;
  title: string;
  description: string;
  highlights: string[];
}

export interface StudentFeature {
  icon: string;
  title: string;
  description: string;
  imageSrc: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export const ctas: CtaItem[] = [
  { label: "Entrar com código", href: "/enroll", variant: "secondary" },
  { label: "Iniciar sessão", href: "/login", variant: "ghost" },
];

export const heroContent = {
  eyebrow: "Plataforma de operação académica com IA",
  headline: "Transformar a educação.\nPotenciar o ensino.",
  subheadline:
    "Horários, conteúdos, alunos e analítica financeira — tudo numa única plataforma desenhada para centros de explicações e escolas.",
  ctas,
};

export const outcomeCards: OutcomeCard[] = [
  {
    icon: "🏫",
    title: "Comece a operar desde o primeiro dia",
    description:
      "Configure o seu centro em minutos. Professores e alunos entram com um código simples — sem complicações nem esperas.",
  },
  {
    icon: "📅",
    title: "Organize sessões sem folhas de cálculo",
    description:
      "Veja toda a ocupação do centro num calendário intuitivo. Recorra sessões automaticamente e gestione presenças sem esforço.",
  },
  {
    icon: "🤖",
    title: "Prepare aulas em minutos, não em horas",
    description:
      "A IA gera quizzes, fichas e apresentações a partir dos seus documentos. O currículo português já está incluído.",
  },
  {
    icon: "📋",
    title: "Saiba sempre quem entregou o trabalho",
    description:
      "Acompanhe os TPC de todos os alunos num só sítio. Receba notificações e reveja entregas sem perder tempo.",
  },
  {
    icon: "💬",
    title: "Dê aos alunos apoio 24 horas por dia",
    description:
      "O chat IA da LUSIA responde às dúvidas dos alunos com base na matéria lecionada. O professor pode focar-se no que importa.",
  },
  {
    icon: "📊",
    title: "Saiba se o seu centro está rentável",
    description:
      "Veja receitas, custos e lucros em tempo real. Tome decisões informadas sobre preços, professores e tipos de sessão.",
  },
];

export const whyPillars: WhyPillar[] = [
  {
    icon: "box",
    title: "Tudo num só sítio",
    description:
      "Gestão académica, operacional e financeira integrada. Acabe com as folhas de cálculo e as apps paralelas.",
  },
  {
    icon: "sparkles",
    title: "A IA trabalha consigo",
    description:
      "Gera materiais em minutos, tira dúvidas dos alunos e prepara aulas. Um assistente que não dorme.",
  },
  {
    icon: "brain",
    title: "A IA que conhece o seu arquivo",
    description:
      "Carregue PDFs, fichas e apontamentos. A IA responde com base na sua matéria, não genérica.",
  },
  {
    icon: "chart",
    title: "Números que decidem por si",
    description:
      "Saiba o lucro por aluno, turma e sessão. Receitas e custos em tempo real para decidir com factos.",
  },
];

export const demoSteps: DemoStep[] = [
  {
    step: 1,
    title: "Carregue o que já tem",
    description:
      "PDFs, fichas ou apontamentos — a plataforma processa automaticamente. Não precisa de formatar nada.",
  },
  {
    step: 2,
    title: "Escolha o que precisa",
    description:
      "Quiz para testar conhecimentos, ficha para praticar, ou apresentação para a sala de aula.",
  },
  {
    step: 3,
    title: "A IA faz o trabalho",
    description:
      "Em segundos, tem material novo alinhado com o currículo. O que levava horas, agora leva um café.",
  },
  {
    step: 4,
    title: "Partilhe com os alunos",
    description:
      "Revise se necessário e publique diretamente. Os alunos recebem tudo na plataforma, sem emails.",
  },
];

export const operationsTabs: OperationsTab[] = [
  {
    id: "calendar",
    icon: "📅",
    title: "Organize as sessões em minutos",
    description:
      "Calendário claro que mostra tudo de uma vez. Recorra sessões automaticamente e veja quem faltou num clique.",
    highlights: [
      "Visão semanal e mensal completa",
      "Recorrência automática inteligente",
      "Presenças registadas em segundos",
    ],
  },
  {
    id: "enrollment",
    icon: "🔑",
    title: "Inscreva sem complicações",
    description:
      "Professores e alunos entram com um código simples. Não precisa de enviar emails nem criar contas manualmente.",
    highlights: [
      "Códigos por turma ou sessão",
      "Onboarding automático por perfil",
      "Gestão de acessos simples",
    ],
  },
  {
    id: "assignments",
    icon: "📝",
    title: "Acompanhe todos os trabalhos",
    description:
      "Crie TPC com múltiplos ficheiros, defina prazos e veja quem entregou. Os alunos sabem sempre o que têm de fazer.",
    highlights: [
      "Até 3 ficheiros por trabalho",
      "Estado de entrega visível",
      "Revisão integrada na plataforma",
    ],
  },
];

export const studentFeatures: StudentFeature[] = [
  {
    icon: "💬",
    title: "Tire dúvidas a qualquer hora",
    description:
      "O chat IA responde com base na matéria lecionada e nos documentos partilhados.",
    imageSrc: "/Screenshots_Student/1-modified.webp",
  },
  {
    icon: "📋",
    title: "Saiba sempre o que entregar",
    description:
      "Todos os trabalhos num só sítio, com prazos claros.",
    imageSrc: "/Screenshots_Student/2-modified.webp",
  },
  {
    icon: "🎓",
    title: "Acompanhe o progresso",
    description:
      "Consulte notas por disciplina e período. Modelo CFS integrado.",
    imageSrc: "/Screenshots_Student/3-modified.webp",
  },
];

export const analyticsHighlights = [
  { label: "Receita", description: "Total faturado por mês e tipo de sessão" },
  { label: "Custo", description: "Encargos por professor e sessão" },
  { label: "Lucro", description: "Margem líquida por aluno e por período" },
  {
    label: "Sessões",
    description: "Volume e tendências ao longo do tempo",
  },
];

export const faqItems: FaqItem[] = [
  {
    question: "É para centros de explicações, escolas ou ambos?",
    answer:
      "A plataforma foi desenhada primeiro para centros de explicações, mas funciona igualmente bem para escolas e ATLs que precisem de gerir sessões, conteúdos e alunos.",
  },
  {
    question: "Os alunos conseguem usar no telemóvel?",
    answer:
      "Sim. A experiência móvel é de primeira classe — os alunos acedem ao chat IA, trabalhos de casa e notas diretamente no telemóvel.",
  },
  {
    question: "Como é que a IA utiliza os meus documentos?",
    answer:
      "Os documentos são processados e indexados dentro da plataforma. A IA gera conteúdos com base neles, sempre alinhada com o currículo selecionado.",
  },
  {
    question: "Os professores podem continuar a usar os seus próprios materiais?",
    answer:
      "Claro. A plataforma aceita uploads de qualquer documento — a IA trabalha a partir do material que o professor já tem.",
  },
  {
    question: "Como é que os utilizadores aderem a um centro existente?",
    answer:
      "Com um código de inscrição partilhado pelo centro. Basta introduzir o código e o perfil é configurado automaticamente.",
  },
  {
    question: "Foi construída para o currículo português?",
    answer:
      "Sim. O sistema conhece o currículo nacional, os anos de escolaridade e o modelo de classificações CFS usado em Portugal.",
  },
];

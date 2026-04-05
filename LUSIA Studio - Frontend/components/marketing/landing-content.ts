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
}

export interface FaqItem {
  question: string;
  answer: string;
}

export const ctas: CtaItem[] = [
  { label: "Criar centro", href: "/create-center", variant: "primary" },
  { label: "Entrar com código", href: "/enroll", variant: "secondary" },
  { label: "Iniciar sessão", href: "/login", variant: "ghost" },
];

export const heroContent = {
  eyebrow: "Plataforma de operação académica com IA",
  headline: "Gerir o centro.\nPotenciar o ensino.",
  subheadline:
    "Horários, conteúdos, alunos e analítica financeira — tudo numa única plataforma desenhada para centros de explicações e escolas.",
  ctas,
};

export const outcomeCards: OutcomeCard[] = [
  {
    icon: "🏫",
    title: "Criar e gerir o centro",
    description:
      "Crie a organização, defina salas e inscreva professores e alunos com códigos de acesso.",
  },
  {
    icon: "📅",
    title: "Agendar sessões",
    description:
      "Calendário completo com recorrência, tipos de sessão e gestão de presenças.",
  },
  {
    icon: "🤖",
    title: "Gerar conteúdos com IA",
    description:
      "Carregue documentos e gere quizzes, fichas, apresentações e resumos automaticamente.",
  },
  {
    icon: "📋",
    title: "Atribuir trabalhos",
    description:
      "Publique trabalhos de casa com até 3 artefactos e acompanhe as entregas.",
  },
  {
    icon: "💬",
    title: "Apoiar alunos com chat IA",
    description:
      "Os alunos recebem ajuda contextual e alinhada com o currículo nacional.",
  },
  {
    icon: "📊",
    title: "Controlar resultados e finanças",
    description:
      "Notas, classificações finais e analítica de receita, custo e lucro por sessão.",
  },
];

export const whyPillars: WhyPillar[] = [
  {
    icon: "⚙️",
    title: "Operações num só lugar",
    description:
      "Inscrições, horários, presenças e comunicação centralizada — sem folhas de cálculo nem sistemas paralelos.",
  },
  {
    icon: "⚡",
    title: "Ensino acelerado com IA",
    description:
      "Os professores criam materiais de estudo em minutos a partir de qualquer documento, respeitando o currículo.",
  },
  {
    icon: "🎯",
    title: "Apoio contextual ao aluno",
    description:
      "O chat IA conhece a matéria, o ano e os documentos partilhados — não é um chatbot genérico.",
  },
  {
    icon: "📈",
    title: "Visibilidade real do negócio",
    description:
      "Receitas, custos e lucros por professor, aluno e tipo de sessão — dados prontos para decisão.",
  },
];

export const demoSteps: DemoStep[] = [
  {
    step: 1,
    title: "Carregue o material",
    description:
      "Faça upload de PDFs, fichas ou apontamentos. O sistema processa e indexa automaticamente.",
  },
  {
    step: 2,
    title: "Escolha o formato",
    description:
      "Quiz interativo, ficha de trabalho, apresentação ou resumo — selecione o tipo de conteúdo.",
  },
  {
    step: 3,
    title: "A IA gera o conteúdo",
    description:
      "O motor de IA cria o material alinhado com o currículo, pronto para revisão.",
  },
  {
    step: 4,
    title: "Edite e publique",
    description:
      "Refine o resultado diretamente na plataforma e partilhe com os alunos.",
  },
];

export const operationsTabs: OperationsTab[] = [
  {
    id: "calendar",
    icon: "📅",
    title: "Agendar sessões",
    description:
      "Calendário semanal e mensal com suporte a recorrência, tipos de sessão e atribuição de alunos.",
    highlights: [
      "Sessões individuais e de grupo",
      "Recorrência automática",
      "Gestão de presenças",
    ],
  },
  {
    id: "enrollment",
    icon: "🔑",
    title: "Inscrever utilizadores",
    description:
      "Professores e alunos entram com um código de acesso. Sem convites manuais por email.",
    highlights: [
      "Códigos de inscrição por turma",
      "Onboarding por perfil",
      "Gestão de papéis",
    ],
  },
  {
    id: "assignments",
    icon: "📝",
    title: "Atribuir trabalhos",
    description:
      "Crie trabalhos com múltiplos artefactos, defina prazos e acompanhe as submissões dos alunos.",
    highlights: [
      "Até 3 artefactos por TPC",
      "Acompanhamento de entregas",
      "Revisão inline",
    ],
  },
];

export const studentFeatures: StudentFeature[] = [
  {
    icon: "💬",
    title: "Chat com IA curricular",
    description:
      "O aluno pergunta sobre a matéria e recebe respostas contextualizadas e alinhadas com os documentos partilhados.",
  },
  {
    icon: "📋",
    title: "Trabalhos e submissões",
    description:
      "Visualize os TPC atribuídos, entregue respostas e acompanhe o estado de cada tarefa.",
  },
  {
    icon: "🎓",
    title: "Notas e classificações",
    description:
      "Consulte notas por disciplina e período, incluindo as classificações finais do sistema português.",
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

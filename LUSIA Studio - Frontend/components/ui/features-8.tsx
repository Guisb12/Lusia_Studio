import { Card, CardContent } from '@/components/ui/card'
import { Shield, Clock, Layers, Bot, Brain, BarChart3 } from 'lucide-react'
import { LusiaIcon } from "@/components/icons/LusiaIcon"

export function Features() {
    return (
        <section className="bg-brand-bg pt-8 pb-16 md:pt-12 md:pb-24">
            <div className="mx-auto max-w-3xl lg:max-w-5xl px-6">
                <div className="mb-12 text-center">
                    <h2 className="mx-auto max-w-2xl font-instrument text-3xl leading-tight tracking-tight text-brand-primary sm:text-4xl">
                        A única <span className="font-instrument-italic text-brand-accent">plataforma</span> que precisa
                    </h2>
                </div>
                <div className="relative">
                    <div className="relative z-10 grid grid-cols-6 gap-3">
                        {/* Row 1 */}
                        
                        {/* Integrado - layered/stacked icon */}
                        <Card className="relative col-span-full flex overflow-hidden lg:col-span-2 bg-white border-brand-primary/10">
                            <CardContent className="relative m-auto size-fit pt-6">
                                <div className="relative flex h-24 w-56 items-center justify-center">
                                    <div className="relative flex items-center justify-center">
                                        <div className="absolute -left-4 top-0 h-12 w-12 rounded-xl bg-brand-primary/5 border border-brand-primary/10" />
                                        <div className="absolute left-0 top-2 h-12 w-12 rounded-xl bg-brand-primary/10 border border-brand-primary/15" />
                                        <div className="relative h-12 w-12 rounded-xl bg-brand-primary/15 border border-brand-primary/20 flex items-center justify-center">
                                            <Layers className="h-6 w-6 text-brand-primary" strokeWidth={1.5} />
                                        </div>
                                    </div>
                                </div>
                                <h2 className="mt-6 text-center text-2xl font-semibold text-brand-primary">Integrado</h2>
                                <p className="mt-2 text-center text-sm text-brand-primary/60">Uma plataforma, todas as funções</p>
                            </CardContent>
                        </Card>

                        {/* Seguro */}
                        <Card className="relative col-span-full overflow-hidden sm:col-span-3 lg:col-span-2 bg-white border-brand-primary/10">
                            <CardContent className="pt-6">
                                <div className="relative mx-auto flex aspect-square size-32 rounded-full border border-brand-primary/20 before:absolute before:-inset-2 before:rounded-full before:border before:border-brand-primary/10">
                                    <Shield className="m-auto h-8 w-8 text-brand-primary" strokeWidth={1} />
                                </div>
                                <div className="relative z-10 mt-6 space-y-2 text-center">
                                    <h2 className="text-lg font-medium text-brand-primary">Seguro por defeito</h2>
                                    <p className="text-brand-primary/60 text-sm">Dados protegidos e encriptados</p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* IA Potente */}
                        <Card className="relative col-span-full overflow-hidden lg:col-span-2 bg-white border-brand-primary/10">
                            <CardContent className="pt-6">
                                <div className="relative mx-auto flex aspect-square size-32 rounded-full border border-brand-accent/20 before:absolute before:-inset-2 before:rounded-full before:border before:border-brand-accent/10">
                                    <div className="m-auto flex items-center gap-2">
                                        <Brain className="h-8 w-8 text-brand-accent" strokeWidth={1} />
                                    </div>
                                </div>
                                <div className="relative z-10 mt-6 space-y-2 text-center">
                                    <h2 className="text-lg font-medium text-brand-primary">IA Potente</h2>
                                    <p className="text-brand-primary/60 text-sm">Assistente integrado 24/7</p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Row 2 */}

                        {/* Materiais Instantâneos */}
                        <Card className="relative col-span-full overflow-hidden lg:col-span-2 bg-white border-brand-primary/10">
                            <CardContent className="grid pt-6 sm:grid-cols-2">
                                <div className="relative z-10 flex flex-col justify-between space-y-6">
                                    <div className="relative flex aspect-square size-12 rounded-full border border-brand-primary/20 before:absolute before:-inset-2 before:rounded-full before:border before:border-brand-primary/10">
                                        <Clock className="m-auto size-6 text-brand-primary" strokeWidth={1} />
                                    </div>
                                    <div className="space-y-2">
                                        <h2 className="text-lg font-medium text-brand-primary">Materiais Instantâneos</h2>
                                        <p className="text-brand-primary/60 text-sm">Quizzes e fichas em segundos</p>
                                    </div>
                                </div>
                                <div className="rounded-tl-(--radius) relative -mb-6 -mr-6 mt-6 h-fit border-l border-t border-brand-primary/10 p-6 sm:ml-6 flex items-center justify-center">
                                    <svg className="h-16 w-16 text-brand-accent/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                        <polyline points="14 2 14 8 20 8" />
                                        <line x1="16" y1="13" x2="8" y2="13" />
                                        <line x1="16" y1="17" x2="8" y2="17" />
                                        <polyline points="10 9 9 9 8 9" />
                                    </svg>
                                </div>
                            </CardContent>
                        </Card>

                        {/* CPU Architecture - HERO - spans 4 cols */}
                        <Card className="relative col-span-full overflow-hidden lg:col-span-4 bg-white border-brand-primary/10">
                            <CardContent className="flex flex-col items-center justify-center py-8 px-6">
                                <div className="w-full" style={{ maxWidth: "600px" }}>
                                    <svg className="w-full h-auto" viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ maxHeight: "180px" }}>
                                        <g stroke="#15316b" strokeWidth="0.3" strokeDasharray="100 100" pathLength="100">
                                            <path id="path-f1" strokeDasharray="100 100" pathLength="100" d="M 10 20 h 79.5 q 5 0 5 5 v 30" />
                                            <path id="path-f2" strokeDasharray="100 100" pathLength="100" d="M 180 10 h -69.7 q -5 0 -5 5 v 30" />
                                            <path id="path-f3" d="M 130 20 v 21.8 q 0 5 -5 5 h -10" />
                                            <path id="path-f4" d="M 170 80 v -21.8 q 0 -5 -5 -5 h -50" />
                                            <path id="path-f5" strokeDasharray="100 100" pathLength="100" d="M 135 65 h 15 q 5 0 5 5 v 10 q 0 5 -5 5 h -39.8 q -5 0 -5 -5 v -20" />
                                            <path id="path-f6" d="M 94.8 95 v -36" />
                                            <path id="path-f8" d="M 30 30 h 25 q 5 0 5 5 v 6.5 q 0 5 5 5 h 20" />
                                        </g>

                                        <g mask="url(#cpu-mask-f1)">
                                            <circle cx="0" cy="0" r="8" fill="url(#cpu-blue-grad-f)">
                                                <animateMotion dur="3s" repeatCount="indefinite"><mpath href="#path-f1" /></animateMotion>
                                            </circle>
                                        </g>
                                        <g mask="url(#cpu-mask-f2)">
                                            <circle cx="0" cy="0" r="8" fill="url(#cpu-yellow-grad-f)">
                                                <animateMotion dur="3s" repeatCount="indefinite" begin="0.5s"><mpath href="#path-f2" /></animateMotion>
                                            </circle>
                                        </g>
                                        <g mask="url(#cpu-mask-f3)">
                                            <circle cx="0" cy="0" r="8" fill="url(#cpu-pinkish-grad-f)">
                                                <animateMotion dur="3s" repeatCount="indefinite" begin="1s"><mpath href="#path-f3" /></animateMotion>
                                            </circle>
                                        </g>
                                        <g mask="url(#cpu-mask-f4)">
                                            <circle cx="0" cy="0" r="8" fill="url(#cpu-white-grad-f)">
                                                <animateMotion dur="3s" repeatCount="indefinite" begin="1.5s"><mpath href="#path-f4" /></animateMotion>
                                            </circle>
                                        </g>
                                        <g mask="url(#cpu-mask-f5)">
                                            <circle cx="0" cy="0" r="8" fill="url(#cpu-green-grad-f)">
                                                <animateMotion dur="3s" repeatCount="indefinite" begin="2s"><mpath href="#path-f5" /></animateMotion>
                                            </circle>
                                        </g>
                                        <g mask="url(#cpu-mask-f6)">
                                            <circle cx="0" cy="0" r="8" fill="url(#cpu-orange-grad-f)">
                                                <animateMotion dur="3s" repeatCount="indefinite" begin="2.5s"><mpath href="#path-f6" /></animateMotion>
                                            </circle>
                                        </g>
                                        <g mask="url(#cpu-mask-f8)">
                                            <circle cx="0" cy="0" r="8" fill="url(#cpu-rose-grad-f)">
                                                <animateMotion dur="3s" repeatCount="indefinite" begin="3.5s"><mpath href="#path-f8" /></animateMotion>
                                            </circle>
                                        </g>

                                        <image href="/hero_logos/kahhot.svg" x="5" y="15" width="10" height="10" />
                                        <image href="/hero_logos/powerpoint.svg" x="175" y="5" width="10" height="10" />
                                        <image href="/hero_logos/excel.svg" x="165" y="75" width="10" height="10" />
                                        <image href="/hero_logos/google_calendar.svg" x="130" y="60" width="10" height="10" />
                                        <image href="/hero_logos/notebookLM.svg" x="89.8" y="90" width="10" height="10" />
                                        <image href="/hero_logos/word.svg" x="25" y="25" width="10" height="10" />

                                        <g>
                                            <rect x="85" y="40" width="30" height="20" rx="2" fill="#15316b" />
                                            <foreignObject x="88" y="42" width="24" height="16">
                                                <div className="flex h-full w-full flex-col items-center justify-center">
                                                    <LusiaIcon size={10} className="text-white" />
                                                    <span className="font-lusia text-[6px] text-white">LUSIA</span>
                                                </div>
                                            </foreignObject>
                                        </g>

                                        <defs>
                                            <mask id="cpu-mask-f1"><path d="M 10 20 h 79.5 q 5 0 5 5 v 24" strokeWidth="0.5" stroke="white" /></mask>
                                            <mask id="cpu-mask-f2"><path d="M 180 10 h -69.7 q -5 0 -5 5 v 24" strokeWidth="0.5" stroke="white" /></mask>
                                            <mask id="cpu-mask-f3"><path d="M 130 20 v 21.8 q 0 5 -5 5 h -10" strokeWidth="0.5" stroke="white" /></mask>
                                            <mask id="cpu-mask-f4"><path d="M 170 80 v -21.8 q 0 -5 -5 -5 h -50" strokeWidth="0.5" stroke="white" /></mask>
                                            <mask id="cpu-mask-f5"><path d="M 135 65 h 15 q 5 0 5 5 v 10 q 0 5 -5 5 h -39.8 q -5 0 -5 -5 v -20" strokeWidth="0.5" stroke="white" /></mask>
                                            <mask id="cpu-mask-f6"><path d="M 94.8 95 v -36" strokeWidth="0.5" stroke="white" /></mask>
                                            <mask id="cpu-mask-f8"><path d="M 30 30 h 25 q 5 0 5 5 v 6.5 q 0 5 5 5 h 20" strokeWidth="0.5" stroke="white" /></mask>
                                            <radialGradient id="cpu-blue-grad-f" fx="1"><stop offset="0%" stopColor="#00E8ED" /><stop offset="50%" stopColor="#08F" /><stop offset="100%" stopColor="transparent" /></radialGradient>
                                            <radialGradient id="cpu-yellow-grad-f" fx="1"><stop offset="0%" stopColor="#FFD800" /><stop offset="50%" stopColor="#FFD800" /><stop offset="100%" stopColor="transparent" /></radialGradient>
                                            <radialGradient id="cpu-pinkish-grad-f" fx="1"><stop offset="0%" stopColor="#830CD1" /><stop offset="50%" stopColor="#FF008B" /><stop offset="100%" stopColor="transparent" /></radialGradient>
                                            <radialGradient id="cpu-white-grad-f" fx="1"><stop offset="0%" stopColor="white" /><stop offset="100%" stopColor="transparent" /></radialGradient>
                                            <radialGradient id="cpu-green-grad-f" fx="1"><stop offset="0%" stopColor="#22c55e" /><stop offset="100%" stopColor="transparent" /></radialGradient>
                                            <radialGradient id="cpu-orange-grad-f" fx="1"><stop offset="0%" stopColor="#f97316" /><stop offset="100%" stopColor="transparent" /></radialGradient>
                                            <radialGradient id="cpu-rose-grad-f" fx="1"><stop offset="0%" stopColor="#f43f5e" /><stop offset="100%" stopColor="transparent" /></radialGradient>
                                        </defs>
                                    </svg>
                                </div>
                                <h2 className="mt-6 text-center text-2xl font-semibold text-brand-primary">Seis ferramentas. Uma só plataforma.</h2>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </section>
    )
}
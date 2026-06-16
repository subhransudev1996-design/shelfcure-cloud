'use client';

export interface PromotionProps {
  title: string;
  body: string;
  couponCode?: string;
  storeName: string;
  primaryColor: string;
  secondaryColor: string;
  festivalType?: 'generic' | 'diwali' | 'holi' | 'eid' | 'christmas' | 'new_year' | 'durga_puja' | 'ganesh_puja' | 'shiva_ratri' | 'janmastami';
  festivalVariant?: number;
  fontFamily?: string;
}

export const PromotionTemplates = {
  minimal: ({ title, body, storeName, primaryColor, secondaryColor, fontFamily }: PromotionProps) => (
    <div
      className="w-[400px] h-[600px] flex flex-col justify-between p-8 relative overflow-hidden text-white"
      style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`, fontFamily: fontFamily || 'inherit' }}
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/20 rounded-full -ml-16 -mb-16 blur-2xl" />
      <div className="relative z-10 flex flex-col h-full items-center justify-center text-center">
        <div className="mb-4">
          <span className="text-xs font-black uppercase tracking-[0.3em] opacity-60">{storeName}</span>
        </div>
        <h2 className="text-4xl font-bold mb-6 leading-tight tracking-tight">{title}</h2>
        <p className="text-lg opacity-90 leading-relaxed max-w-[280px]">{body}</p>
      </div>
      <div className="relative z-10 border-t border-white/20 pt-6 flex flex-col items-center">
        <img src="/logo.png" alt="ShelfCure" className="h-4 w-auto opacity-40 brightness-0 invert" />
      </div>
    </div>
  ),

  vibrant: ({ title, body, storeName, primaryColor, secondaryColor, fontFamily, festivalVariant = 1 }: PromotionProps) => {
    if (festivalVariant === 2) {
      return (
        <div
          className="w-[400px] h-[600px] flex flex-col p-0 relative overflow-hidden bg-[#050505] text-white shadow-2xl"
          style={{ fontFamily: fontFamily || 'inherit' }}
        >
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `linear-gradient(45deg, ${primaryColor} 25%, transparent 25%, transparent 50%, ${primaryColor} 50%, ${primaryColor} 75%, transparent 75%, transparent)`, backgroundSize: '100px 100px' }} />
          <div className="absolute inset-0 bg-gradient-to-br from-transparent via-black/40 to-black/80" />
          <div className="relative z-10 p-12 flex flex-col h-full">
            <div className="mb-12">
              <div className="w-16 h-1 mb-4" style={{ backgroundColor: secondaryColor }} />
              <span className="text-[10px] font-black uppercase tracking-[0.5em] text-zinc-500">{storeName}</span>
            </div>
            <div className="flex-1 flex flex-col justify-center">
              <h2 className="text-6xl font-black leading-[0.85] tracking-tighter mb-8 uppercase break-words" style={{ textShadow: `4px 4px 0px ${primaryColor}` }}>{title}</h2>
              <p className="text-xl font-bold border-l-4 pl-6 py-2 leading-relaxed" style={{ borderColor: secondaryColor }}>{body}</p>
            </div>
            <div className="mt-auto pt-10 flex items-end justify-between border-t border-white/10">
              <div className="flex flex-col gap-1">
                <div className="flex gap-1">{[1, 2, 3].map(i => (<div key={i} className="w-6 h-1 bg-white/10" />))}</div>
                <span className="text-[8px] font-black uppercase tracking-[0.2em] text-zinc-600">Premium Series</span>
              </div>
              <img src="/logo.png" alt="ShelfCure" className="h-4 w-auto opacity-30 brightness-0 invert" />
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="w-[400px] h-[600px] flex flex-col justify-between p-0 relative overflow-hidden" style={{ backgroundColor: '#000', fontFamily: fontFamily || 'inherit' }}>
        <div className="absolute inset-0 opacity-50" style={{ backgroundImage: `radial-gradient(circle at 50% 50%, ${primaryColor}40, transparent 70%)` }} />
        <div className="relative z-10 p-10 flex flex-col h-full bg-black/40 backdrop-blur-sm border border-white/10 m-4 rounded-3xl overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-24 h-24 blur-[60px]" style={{ backgroundColor: secondaryColor }} />
          <div className="mt-4">
            <h2 className="text-4xl font-black text-white leading-none mb-4 tracking-tighter" style={{ textShadow: `0 0 20px ${primaryColor}80` }}>{title}</h2>
            <div className="w-12 h-1 bg-white mb-6" />
            <p className="text-zinc-300 text-lg leading-relaxed font-medium">{body}</p>
          </div>
          <div className="mt-auto pt-8 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest leading-none mb-1">Store</span>
              <span className="text-white font-bold tracking-tight">{storeName}</span>
            </div>
            <div className="flex flex-col items-end gap-3">
              <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: primaryColor }} />
              </div>
              <img src="/logo.png" alt="ShelfCure" className="h-4 w-auto opacity-30 brightness-0 invert" />
            </div>
          </div>
        </div>
      </div>
    );
  },

  festival: ({ title, body, storeName, primaryColor, secondaryColor, festivalType = 'generic', festivalVariant = 1, fontFamily }: PromotionProps) => {
    const renderDecorations = () => {
      switch (festivalType) {
        case 'diwali':
          return festivalVariant === 2 ? (
            <>
              <div className="absolute top-10 left-1/2 -translate-x-1/2 flex gap-8 opacity-40">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex flex-col items-center">
                    <div className="w-1 h-12 bg-zinc-700" />
                    <div className="w-8 h-8 rounded-full border-2 border-primary mt-[-4px]" style={{ borderColor: primaryColor }} />
                    <div className="w-4 h-4 rounded-full mt-[-10px] animate-pulse" style={{ backgroundColor: primaryColor }} />
                  </div>
                ))}
              </div>
              <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-orange-500/20 to-transparent blur-2xl" />
            </>
          ) : (
            <>
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 2px 2px, ${primaryColor} 1px, transparent 0)`, backgroundSize: '24px 24px' }} />
              <div className="absolute bottom-0 w-full flex justify-around p-8 opacity-40">
                {[1, 2, 3].map(i => (
                  <svg key={i} width="40" height="40" viewBox="0 0 100 100" fill={primaryColor}>
                    <path d="M50 20C50 20 30 50 30 70C30 81 39 90 50 90C61 90 70 81 70 70C70 50 50 20 50 20ZM50 80C44 80 40 76 40 70C40 64 50 50 50 50C50 50 60 64 60 70C60 76 56 80 50 80Z" />
                  </svg>
                ))}
              </div>
            </>
          );
        case 'holi':
          return festivalVariant === 2 ? (
            <>
              <div className="absolute inset-0 opacity-40" style={{ background: `conic-gradient(from 0deg at 50% 50%, ${primaryColor}, ${secondaryColor}, ${primaryColor})`, filter: 'blur(60px)' }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-full h-1/2 opacity-20" style={{ background: `repeating-radial-gradient(circle, ${primaryColor}, ${primaryColor} 10px, transparent 10px, transparent 20px)` }} />
              </div>
            </>
          ) : (
            <>
              <div className="absolute top-0 left-0 w-48 h-48 blur-[80px] opacity-30" style={{ backgroundColor: primaryColor }} />
              <div className="absolute bottom-0 right-0 w-48 h-48 blur-[80px] opacity-30" style={{ backgroundColor: secondaryColor }} />
            </>
          );
        case 'eid':
          return (
            <>
              <div className="absolute top-10 right-10 opacity-40">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke={primaryColor} strokeWidth="1"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
              </div>
              <div className="absolute bottom-0 inset-x-0 h-40 opacity-10" style={{ backgroundImage: `repeating-linear-gradient(45deg, ${primaryColor}, ${primaryColor} 2px, transparent 2px, transparent 8px)` }} />
            </>
          );
        case 'christmas':
          return (
            <>
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-green-900/10 blur-[100px]" />
              <div className="absolute top-4 left-4 w-2 h-2 rounded-full bg-red-500 animate-ping" />
              <div className="absolute top-12 right-8 w-2 h-2 rounded-full bg-white animate-ping" style={{ animationDelay: '0.3s' }} />
            </>
          );
        case 'new_year':
          return (
            <>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_#000_100%)] opacity-60" />
              <div className="absolute top-20 left-1/4 w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: primaryColor }} />
              <div className="absolute top-1/3 right-1/4 w-1.5 h-1.5 rounded-full animate-ping" style={{ backgroundColor: secondaryColor, animationDelay: '0.5s' }} />
            </>
          );
        default:
          return (
            <>
              <div className="absolute top-4 left-4 w-12 h-12 opacity-40" style={{ borderTop: `2px solid ${primaryColor}`, borderLeft: `2px solid ${primaryColor}` }} />
              <div className="absolute top-4 right-4 w-12 h-12 opacity-40" style={{ borderTop: `2px solid ${primaryColor}`, borderRight: `2px solid ${primaryColor}` }} />
              <div className="absolute bottom-4 left-4 w-12 h-12 opacity-40" style={{ borderBottom: `2px solid ${primaryColor}`, borderLeft: `2px solid ${primaryColor}` }} />
              <div className="absolute bottom-4 right-4 w-12 h-12 opacity-40" style={{ borderBottom: `2px solid ${primaryColor}`, borderRight: `2px solid ${primaryColor}` }} />
            </>
          );
      }
    };

    return (
      <div
        className="w-[400px] h-[600px] flex flex-col items-center justify-center p-8 relative overflow-hidden"
        style={{ background: `radial-gradient(circle at center, #1a1a1a 0%, #000 100%)`, border: `2px solid ${primaryColor}40`, fontFamily: fontFamily || 'inherit' }}
      >
        {renderDecorations()}
        <div className="relative z-10 text-center">
          <h3 className="text-lg font-black uppercase tracking-[0.5em] mb-4" style={{ color: primaryColor }}>{storeName}</h3>
          <h2 className="text-5xl font-black text-white mb-8 tracking-tighter leading-none whitespace-pre-line">{title}</h2>
          <div className="max-w-[280px] mx-auto">
            <p className="text-zinc-400 text-lg italic">{body}</p>
          </div>
        </div>
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-6">
          <div className="opacity-20">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={primaryColor} strokeWidth="2" strokeLinecap="round"><path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07L19.07 4.93" /></svg>
          </div>
          <img src="/logo.png" alt="ShelfCure" className="h-4 w-auto opacity-30 brightness-0 invert" />
        </div>
      </div>
    );
  },

  coupon: ({ title, body, couponCode, storeName, primaryColor, fontFamily, festivalVariant = 1 }: PromotionProps) => {
    if (festivalVariant === 2) {
      return (
        <div className="w-[400px] h-[600px] p-0 flex flex-col relative overflow-hidden text-white shadow-2xl" style={{ backgroundColor: primaryColor, fontFamily: fontFamily || 'inherit' }}>
          <div className="absolute inset-0 bg-gradient-to-br from-black/20 via-transparent to-black/60 pointer-events-none" />
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-black/20 rounded-full blur-3xl" />
          <div className="relative z-10 m-6 flex-1 flex flex-col border-[3px] border-white/20 rounded-[32px] overflow-hidden bg-black/10 backdrop-blur-md">
            <div className="absolute top-[65%] -left-5 -translate-y-1/2 w-10 h-10 bg-[#0a0a0a] rounded-full z-20 shadow-inner border border-white/10" />
            <div className="absolute top-[65%] -right-5 -translate-y-1/2 w-10 h-10 bg-[#0a0a0a] rounded-full z-20 shadow-inner border border-white/10" />
            <div className="p-8 flex-1 flex flex-col items-center justify-center text-center">
              <div className="mb-6">
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 block mb-1">Presented by</span>
                <span className="text-sm font-bold tracking-tight">{storeName}</span>
              </div>
              <h2 className="text-5xl font-black leading-[0.9] mb-4 tracking-tighter uppercase italic" style={{ textShadow: '0 4px 15px rgba(0,0,0,0.4)' }}>{title}</h2>
              <p className="text-sm font-medium opacity-80 max-w-[240px] leading-relaxed mb-8">{body}</p>
              <div className="w-full flex items-center gap-2 px-2 mb-8 mt-2 opacity-30">
                <div className="h-px flex-1 border-t-2 border-dashed border-white/50" />
              </div>
              <div className="space-y-4 w-full px-4">
                <div className="bg-white text-black py-4 px-2 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.3)] transform -rotate-1">
                  <span className="text-[10px] font-black uppercase tracking-widest block opacity-40 mb-1 leading-none">Coupon Code</span>
                  <span className="text-3xl font-black tracking-[0.1em]">{couponCode ?? 'WELCOME10'}</span>
                </div>
                <p className="text-[9px] font-bold uppercase tracking-[0.25em] opacity-40">Valid for Limited Time Only</p>
              </div>
            </div>
          </div>
          <div className="relative z-10 pb-10 flex justify-center">
            <img src="/logo.png" alt="ShelfCure" className="h-[14px] w-auto brightness-0 invert opacity-40" />
          </div>
        </div>
      );
    }
    return (
      <div className="w-[400px] h-[600px] bg-zinc-950 p-6 flex flex-col relative overflow-hidden border border-white/5" style={{ fontFamily: fontFamily || 'inherit' }}>
        <div className="absolute -top-20 -left-20 w-64 h-64 rounded-full blur-[100px] opacity-20" style={{ backgroundColor: primaryColor }} />
        <div className="relative z-10 border-2 border-dashed border-white/10 rounded-2xl flex-1 flex flex-col p-8 bg-zinc-900/40 backdrop-blur-md">
          <div className="flex justify-between items-start mb-8">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1">Offer From</span>
              <span className="text-white font-bold">{storeName}</span>
            </div>
          </div>
          <div className="mb-auto">
            <h2 className="text-4xl font-black text-white leading-tight mb-4">{title}</h2>
            <p className="text-zinc-400 font-medium leading-relaxed">{body}</p>
          </div>
          <div className="mt-8">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-3 text-center">Your Coupon Code</span>
            <div className="bg-white/5 border border-white/10 p-4 rounded-xl text-center">
              <span className="text-3xl font-black tracking-[0.2em] text-white" style={{ textShadow: `0 0 10px ${primaryColor}40` }}>
                {couponCode ?? 'WELCOME10'}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-center">
          <img src="/logo.png" alt="ShelfCure" className="h-4 w-auto opacity-30 brightness-0 invert" />
        </div>
      </div>
    );
  },
};

export type TemplateId = keyof typeof PromotionTemplates;

export const TEMPLATE_LIST = [
  { id: 'minimal' as const, name: 'Glassmorphic Minimal', description: 'Modern, clean design with smooth gradients.' },
  { id: 'vibrant' as const, name: 'Vibrant Neo-Dark', description: 'High contrast, bold typography and glowing accents.' },
  { id: 'festival' as const, name: 'Festival Elegance', description: 'Traditional vibes with contemporary aesthetics.' },
  { id: 'coupon' as const, name: 'Digital Coupon', description: 'Perfect for discounts and promotional codes.' },
];

export type FestivalType = 'generic' | 'diwali' | 'holi' | 'eid' | 'christmas' | 'new_year' | 'durga_puja' | 'ganesh_puja' | 'shiva_ratri' | 'janmastami';

export const FESTIVAL_DEFAULTS: Record<FestivalType, { title: string; body: string; primary: string; secondary: string }> = {
  diwali: { title: 'Happy Diwali', body: 'Wishing you a festival full of sweet memories,\nsky full of fireworks, and heart full of joy.', primary: '#f59e0b', secondary: '#ef4444' },
  holi: { title: 'Happy Holi', body: 'May the splash of colors bring joy to your family.\nHave a safe and healthy Holi!', primary: '#ec4899', secondary: '#8b5cf6' },
  eid: { title: 'Eid Mubarak', body: 'May this Eid bring peace, happiness, and prosperity\nto everyone. Best wishes from our team.', primary: '#10b981', secondary: '#059669' },
  christmas: { title: 'Merry Christmas', body: 'Wishing you a season of blessings and a year of prosperity.\nStay healthy and happy!', primary: '#ef4444', secondary: '#16a34a' },
  new_year: { title: 'Happy New Year', body: 'Wishing you a year full of health, happiness, and prosperity!\nStay safe and blessed.', primary: '#38bdf8', secondary: '#818cf8' },
  durga_puja: { title: 'Happy Durga Puja', body: 'May Maa Durga bless you with strength, courage,\nand endless happiness. Jai Maa Durga!', primary: '#f43f5e', secondary: '#fb923c' },
  ganesh_puja: { title: 'Happy Ganesh Chaturthi', body: 'May Lord Ganesha remove all obstacles and fill your life\nwith wisdom and health. Ganpati Bappa Morya!', primary: '#fbbf24', secondary: '#f97316' },
  shiva_ratri: { title: 'Happy Maha Shivaratri', body: 'May the divine light of Lord Shiva guide you\ntowards peace and well-being. Om Namah Shivaya!', primary: '#8b5cf6', secondary: '#3b82f6' },
  janmastami: { title: 'Happy Janmashtami', body: 'May Lord Krishna bring health, wealth, and joy\nto your heart and home. Jai Shri Krishna!', primary: '#0ea5e9', secondary: '#6366f1' },
  generic: { title: 'Special Greetings', body: 'Warm wishes from our pharmacy to you.\nYour health is our priority.', primary: '#06b6d4', secondary: '#3b82f6' },
};

export const FONT_OPTIONS = [
  { label: 'Montserrat', value: "'Montserrat', sans-serif" },
  { label: 'Inter', value: "'Inter', sans-serif" },
  { label: 'Poppins', value: "'Poppins', sans-serif" },
  { label: 'System Default', value: 'inherit' },
];

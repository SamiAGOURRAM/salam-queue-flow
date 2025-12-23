import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const languages = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'ar', name: 'الدارجة', flag: '🇲🇦' },
];

export const LanguageSwitcher = () => {
  const { i18n } = useTranslation();

  const changeLanguage = (languageCode: string) => {
    i18n.changeLanguage(languageCode);
    
    // Update document direction for RTL languages
    if (languageCode === 'ar') {
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'ar';
    } else {
      document.documentElement.dir = 'ltr';
      document.documentElement.lang = languageCode;
    }
  };

  const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 h-8 px-2 rounded-[4px]",
            "border border-border/60 hover:border-foreground/40",
            "bg-background hover:bg-muted/50",
            "transition-colors text-sm font-medium",
            "text-muted-foreground hover:text-foreground"
          )}
          aria-label="Change language"
        >
          <Globe className="w-3.5 h-3.5" />
          <span className="text-base leading-none">{currentLanguage.flag}</span>
          <span className="hidden sm:inline text-xs uppercase tracking-wide">
            {currentLanguage.code}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="w-40 rounded-[4px] border-border/60 p-1"
      >
        {languages.map((language) => {
          const isActive = i18n.language === language.code;
          return (
            <DropdownMenuItem
              key={language.code}
              onClick={() => changeLanguage(language.code)}
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-2 rounded-[2px] cursor-pointer",
                "text-sm font-medium transition-colors",
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <span className="text-lg leading-none">{language.flag}</span>
              <span className="flex-1">{language.name}</span>
              {isActive && (
                <Check className="w-3.5 h-3.5 text-foreground" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

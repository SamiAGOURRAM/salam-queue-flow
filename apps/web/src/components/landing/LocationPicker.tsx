import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { getCountries, flagEmoji, normalizeCountryCode } from "@/lib/countries";
import { useCitySearch, type CitySuggestion } from "@/hooks/useCitySearch";

interface LocationPickerProps {
  /** ISO alpha-2 country code (controlled). */
  countryCode: string;
  /** City text (controlled). */
  city: string;
  onCountryChange: (code: string) => void;
  onCityChange: (city: string) => void;
  /** Optional ref to the city input (lets a parent "change location" affordance focus it). */
  cityInputRef?: React.Ref<HTMLInputElement>;
  className?: string;
}

/**
 * Country selector (full international list, searchable) + live city autocomplete.
 * The country scopes the city suggestions so the user explicitly confirms their
 * location instead of the platform silently guessing from IP.
 */
export function LocationPicker({
  countryCode, city, onCountryChange, onCityChange, cityInputRef, className,
}: LocationPickerProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || "en";

  const countries = useMemo(() => getCountries(locale), [locale]);
  const code = normalizeCountryCode(countryCode);

  const [countryOpen, setCountryOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: suggestions = [], isFetching } = useCitySearch(city, code, locale);
  const showSuggestions = cityOpen && city.trim().length >= 2 && suggestions.length > 0;

  const selectCity = (s: CitySuggestion) => {
    onCityChange(s.name);
    setCityOpen(false);
    setActiveIndex(-1);
  };

  const onCityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        e.preventDefault();
        selectCity(suggestions[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setCityOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div className={cn("relative", className)}>
      <div className="flex items-center gap-2 h-14 bg-muted rounded-xl pl-4 pr-2">
        <div className="w-2.5 h-2.5 bg-obsidian shrink-0" />

        {/* City — live autocomplete */}
        <input
          ref={cityInputRef}
          type="text"
          value={city}
          placeholder={t("landing.search.locationPlaceholder")}
          onChange={(e) => {
            onCityChange(e.target.value);
            setCityOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => {
            if (blurTimeout.current) clearTimeout(blurTimeout.current);
            setCityOpen(true);
          }}
          onBlur={() => {
            blurTimeout.current = setTimeout(() => setCityOpen(false), 150);
          }}
          onKeyDown={onCityKeyDown}
          role="combobox"
          aria-expanded={showSuggestions}
          aria-autocomplete="list"
          className="flex-1 min-w-0 bg-transparent outline-none text-base placeholder:text-muted-foreground"
        />

        {isFetching && city.trim().length >= 2 && (
          <span className="text-xs text-muted-foreground shrink-0">…</span>
        )}

        {/* Country selector */}
        <Popover open={countryOpen} onOpenChange={setCountryOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t("landing.search.countryLabel")}
              title={code}
              className="flex items-center gap-1.5 h-10 px-3 rounded-lg bg-card border border-border hover:bg-muted/60 transition-colors shrink-0"
            >
              {/* Flag glyph where supported; on platforms without flag fonts it shows the
                  2-letter code (regional-indicator letters) — still meaningful, no duplication. */}
              <span className="text-lg leading-none font-medium">{flagEmoji(code)}</span>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-0">
            <Command>
              <CommandInput placeholder={t("landing.search.countrySearch")} />
              <CommandList>
                <CommandEmpty>{t("landing.search.noCountry")}</CommandEmpty>
                <CommandGroup>
                  {countries.map((c) => (
                    <CommandItem
                      key={c.code}
                      value={`${c.name} ${c.code}`}
                      onSelect={() => {
                        onCountryChange(c.code);
                        setCountryOpen(false);
                      }}
                    >
                      <span className="mr-2 text-lg leading-none">{c.flag}</span>
                      <span className="flex-1 truncate">{c.name}</span>
                      {c.code === code && <Check className="w-4 h-4 text-primary" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* City suggestions */}
      {showSuggestions && (
        <div
          className="absolute z-30 left-0 right-0 top-full mt-2 bg-card rounded-xl border border-border shadow-2xl overflow-hidden max-h-[300px] overflow-y-auto"
          role="listbox"
        >
          {suggestions.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={activeIndex === idx}
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseDown={(e) => e.preventDefault()} // keep focus so onBlur doesn't close before click
              onClick={() => selectCity(s)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                activeIndex === idx ? "bg-muted" : "hover:bg-muted",
              )}
            >
              <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="min-w-0">
                <span className="text-sm font-medium text-foreground">{s.name}</span>
                <span className="text-xs text-muted-foreground">
                  {[s.admin1, s.country].filter(Boolean).join(", ")
                    ? ` · ${[s.admin1, s.country].filter(Boolean).join(", ")}`
                    : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default LocationPicker;

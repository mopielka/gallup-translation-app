import React, { useState, useEffect } from 'react';
import {
  Container,
  TextField,
  Button,
  Typography,
  Box,
  Paper,
  Grid,
  Alert,
  CircularProgress
} from '@mui/material';
import { UploadFile } from '@mui/icons-material';

const App: React.FC = () => {
  // ================================
  // Stany aplikacji
  // ================================
  const [apiKey, setApiKey] = useState<string>('');
  const [storedApiKey, setStoredApiKey] = useState<string>('');
  const [inputText, setInputText] = useState<string>('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [result, setResult] = useState<string>(''); // wynikowy kod HTML
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // ================================
  // Wczytanie klucza API z localStorage przy starcie
  // ================================
  useEffect(() => {
    const savedKey = localStorage.getItem('openaiApiKey');
    if (savedKey) {
      setApiKey(savedKey);
      setStoredApiKey(savedKey);
    }
  }, []);

  // ================================
  // Zapis/Usuwanie klucza API
  // ================================
  const handleApiKeySave = () => {
    localStorage.setItem('openaiApiKey', apiKey);
    setStoredApiKey(apiKey);
  };

  const handleApiKeyClear = () => {
    localStorage.removeItem('openaiApiKey');
    setApiKey('');
    setStoredApiKey('');
  };

  // ================================
  // Obsługa zmian w polu tekstowym
  // ================================
  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
  };

  // ================================
  // Obsługa wyboru plików
  // ================================
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      if (e.target.files.length > 10) {
        setError("Możesz wybrać maksymalnie 10 plików.");
        return;
      }
      setFiles(e.target.files);
      // Gdy wybrane są pliki, pole tekstowe zostaje wyłączone
      setInputText('');
      setError('');
    }
  };

  // ================================
  // Funkcja pomocnicza – konwersja pliku do Base64
  // ================================
  const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  };

  // ================================
  // Funkcja pomocnicza – generowanie nazwy pliku na podstawie HTML
  // ================================
  const generateFilename = (htmlContent: string): string => {
    // Próba znalezienia pierwszego nagłówka H1 lub H2
    let match =
      htmlContent.match(/<h1[^>]*>(.*?)<\/h1>/i) ||
      htmlContent.match(/<h2[^>]*>(.*?)<\/h2>/i);
    let name = match ? match[1].trim() : 'dokument';
    // Usuwamy niedozwolone znaki
    name = name.replace(/[\\\/:*?"<>|]/g, '');
    return name || 'dokument';
  };

  // ================================
  // Przetwarzanie danych wejściowych i wywołanie OpenAI API
  // ================================
  const processInput = async () => {
    setError('');

    if (!storedApiKey) {
      setError('Brak klucza API OpenAI. Proszę go wpisać.');
      return;
    }

    const messages: any[] = [
      {
        role: 'system',
        content:
        `
          Przetłumacz zeskanowane strony dokumentu, odwzorowując jak najwierniej ich wygląd, w tym wszelkie formatowanie i układ tekstu. Teksty przetłumacz na naturalny język polski, używając branżowego stylu i słownictwa typowego dla publikacji o Osobowości Gallupa. Wynikowy tekst musi być wyłącznie kodem HTML, gotowym do bezpośredniego renderowania w przeglądarce, i musi zachowywać oryginalny układ oraz formatowanie – nie ograniczaj się do najprostszych paragrafów jeden po drugim, lecz odwzoruj złożoną strukturę dokumentu.
          
          Jeśli w oryginalnym dokumencie występują ilustracje, zastąp je tekstem kursywą w formie:
          “zdjęcie: [opis obrazka]”
          gdzie [opis obrazka] to Twoja interpretacja zawartości danej ilustracji. Jeśli ilustracja posiada podpis lub dodatkowy opis, umieść go również w wyniku, zachowując oryginalne położenie.
          
          Każdy załadowany plik graficzny traktuj jako jedną stronę wynikowego dokumentu. Połącz poszczególne strony w jeden wielostronicowy dokument, oddzielając je linią horyzontalną:
          <hr style="page-break-after: always;">
          Nie dodawaj w odpowiedzi żadnych dodatkowych znaków ani ograniczających znaczników (np. potrójnych backticks). Odpowiedź powinna zawierać wyłącznie wynikowy kod HTML.
        `
      }
    ];

    if (files && files.length > 0) {
      // Budujemy jeden komunikat dla wszystkich obrazków
      const contentArray: any[] = [
        {
          type: 'text',
          text: 'Przesyłam obrazki do analizy:'
        }
      ];

      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          setError('Nieobsługiwany typ pliku. Proszę przesłać tylko obrazki.');
          return;
        }
        try {
          const base64Data = await readFileAsDataURL(file);
          contentArray.push({
            type: 'image_url',
            image_url: {
              url: base64Data
            }
          });
        } catch (err) {
          setError(`Błąd przy odczycie pliku: ${file.name}`);
          return;
        }
      }

      messages.push({
        role: 'user',
        content: contentArray
      });
    } else if (inputText.trim() !== '') {
      messages.push({
        role: 'user',
        content: inputText
      });
    } else {
      setError('Proszę podać tekst lub wybrać obrazki.');
      return;
    }

    // Wywołanie OpenAI API z modelem gpt-4o-mini
    setLoading(true);
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${storedApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: messages
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error?.message || 'Błąd podczas komunikacji z OpenAI API.'
        );
      }

      const data = await response.json();
      let generatedHTML = data.choices[0].message.content;
      // Usuń ewentualne potrójne backticky i dodatkowe znaki, jeśli wystąpią
      generatedHTML = generatedHTML.replace(/^```html\s*/, '').replace(/\s*```$/, '');
      setResult(generatedHTML);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  // ================================
  // Pobieranie wyniku jako plik .html
  // ================================
  const handleDownloadHTML = () => {
    if (!result) return;
    const filename = generateFilename(result) + '.html';
    const blob = new Blob([result], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ================================
  // Drukowanie/Eksport – otwiera nowe okno z wygenerowanym HTML i wywołuje drukowanie przeglądarki
  // ================================
  const handlePrint = () => {
    if (!result) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(`
        <html>
          <head>
            <title>${generateFilename(result)}</title>
            <style>
              @media print {
                hr { page-break-after: always; }
              }
              body {
                font-family: Arial, sans-serif;
                margin: 20px;
              }
            </style>
          </head>
          <body>
            ${result}
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  // ================================
  // Czyszczenie danych wejściowych i wyniku
  // ================================
  const handleClear = () => {
    setInputText('');
    setFiles(null);
    setResult('');
    setError('');
  };

  // ================================
  // Renderowanie UI
  // ================================
  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Paper elevation={3} sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>
          Tłumacz Gallupa
        </Typography>

        {/* Sekcja klucza API */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6">Klucz API OpenAI</Typography>
          {storedApiKey ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
              <Typography variant="body1">Klucz zapisany.</Typography>
              <Button variant="outlined" color="error" onClick={handleApiKeyClear}>
                Wyloguj
              </Button>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
              <TextField
                label="Wprowadź klucz API"
                variant="outlined"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                fullWidth
              />
              <Button variant="contained" onClick={handleApiKeySave}>
                Zapisz
              </Button>
            </Box>
          )}
        </Box>

        {/* Sekcja wejścia – tekst lub obrazki */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6">Wprowadź tekst lub wybierz obrazki</Typography>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Wklej tekst"
                variant="outlined"
                multiline
                rows={8}
                fullWidth
                disabled={files !== null && files.length > 0}
                value={inputText}
                onChange={handleTextChange}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Button variant="contained" component="label" startIcon={<UploadFile />} fullWidth>
                Wybierz obrazki
                <input
                  type="file"
                  hidden
                  multiple
                  accept="image/*"
                  onChange={handleFileChange}
                />
              </Button>
              {files && files.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2">
                    Wybrano {files.length} plik(i):
                  </Typography>
                  <ul>
                    {Array.from(files).map((file, index) => (
                      <li key={index}>{file.name}</li>
                    ))}
                  </ul>
                </Box>
              )}
            </Grid>
          </Grid>
        </Box>

        {/* Wyświetlanie błędów */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Przycisk przetwarzania */}
        <Box sx={{ mb: 3 }}>
          <Button variant="contained" color="primary" onClick={processInput} disabled={loading} fullWidth>
            {loading ? <CircularProgress size={24} /> : 'Przetwórz'}
          </Button>
        </Box>

        {/* Sekcja wyniku – kod HTML */}
        {result && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Wynikowy kod HTML
            </Typography>
            <TextField
              variant="outlined"
              multiline
              rows={12}
              fullWidth
              value={result}
              InputProps={{ readOnly: true }}
            />
          </Box>
        )}

        {/* Przyciski pobierania/drukowania */}
        {result && (
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <Button variant="contained" fullWidth onClick={handleDownloadHTML}>
                Pobierz .html
              </Button>
            </Grid>
            <Grid item xs={6}>
              <Button variant="contained" fullWidth onClick={handlePrint}>
                Drukuj / Eksportuj
              </Button>
            </Grid>
          </Grid>
        )}

        {/* Przycisk czyszczenia */}
        {(inputText || (files && files.length > 0) || result) && (
          <Box sx={{ mt: 3 }}>
            <Button variant="outlined" color="secondary" fullWidth onClick={handleClear}>
              Wyczyść dane
            </Button>
          </Box>
        )}
      </Paper>
    </Container>
  );
};

export default App;
"use client";

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import Link from 'next/link';
import { useChat } from "ai/react";
import Fuse from 'fuse.js';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, MessageSquare, Loader2, AlertCircle, Filter, XCircle, CalculatorIcon } from "lucide-react"; 
import protocolsData from "@/lib/protocols.json";
import { MedicationCalculator } from "@/components/MedicationCalculator";
import { useSearchParams, useRouter } from 'next/navigation';

interface Protocol {
  name: string;
  content: string;
  source_file: string;
  id: string;
  categories?: string[];
}

interface ProtocolData {
  [key: string]: Omit<Protocol, 'id' | 'categories'> & { categories?: string[] };
}

const protocolsList: Protocol[] = Object.entries(protocolsData as ProtocolData).map(([key, protocol]) => ({
    ...protocol,
    id: key,
    name: protocol.name || "Unnamed Protocol", 
    categories: protocol.categories || []
}));

const fuseOptions = {
  includeScore: true,
  threshold: 0.4,
  keys: [
    { name: 'name', weight: 0.6 },
    { name: 'id', weight: 0.5 },
    { name: 'content', weight: 0.2 }
  ]
};

const fuse = new Fuse(protocolsList, fuseOptions);

const CATEGORY_FILTERS = [
    { id: "adult", label: "Adult" },
    { id: "pediatric", label: "Pediatric" },
    { id: "medical", label: "Medical" },
    { id: "trauma", label: "Trauma" },
];

function escapeRegExp(inputString: string): string {
  if (typeof inputString !== 'string') {
    console.error("MANUS DEBUG: escapeRegExp received non-string input:", inputString);
    return ""; 
  }
  // Normalize all newline types to \n, then replace literal newlines with the string "\\n" for RegExp constructor
  let sanitizedString = inputString.replace(/\r\n|\r|\n/g, '\\n');

  // Escape all standard RegExp special characters.
  const escapedString = sanitizedString.replace(/[.*+?^${}()|[\\\]\/\\]/g, '\\$&'); // $& means the whole matched string

  console.log(`MANUS DEBUG: escapeRegExp - Original: "${inputString}", Sanitized for newlines: "${sanitizedString}", Final Escaped: "${escapedString}"`);
  return escapedString;
}

const linkifyContent = (content: string | undefined, allProtocols: Protocol[], currentProtocolId: string): (string | JSX.Element)[] => {
    console.log(`MANUS DEBUG: linkifyContent V5 CALLED for protocol ID: ${currentProtocolId}, content snippet: ${content ? content.substring(0, 70) + "..." : "N/A"}`);
    if (!content) return ["Content not available."];

    const potentialMatches: { index: number; length: number; id: string; title: string; originalMatch: string }[] = [];

    allProtocols.forEach(refProtocol => {
        if (refProtocol.id === currentProtocolId || !refProtocol.name) return;
        
        const escapedTitle = escapeRegExp(refProtocol.name);
        if (!escapedTitle) return; // Skip if title becomes empty after escaping (should not happen with valid titles)

        try {
            const regex = new RegExp(`\\b(${escapedTitle})\\b`, "gi");
            let match;
            while ((match = regex.exec(content)) !== null) {
                potentialMatches.push({
                    index: match.index,
                    length: match[0].length,
                    id: refProtocol.id,
                    title: refProtocol.name, // Store original name for display or other uses
                    originalMatch: match[0]
                });
            }
        } catch (e) {
            console.error(`MANUS DEBUG: Error creating RegExp for title: "${refProtocol.name}", Escaped: "${escapedTitle}"`, e);
            // Optionally, you could add the raw title as text if regex fails, or skip it
        }
    });

    potentialMatches.sort((a, b) => {
        if (a.index !== b.index) {
            return a.index - b.index;
        }
        return b.length - a.length; // Prioritize longer matches at the same position
    });

    const finalMatches: typeof potentialMatches = [];
    let currentPosition = 0;
    for (const match of potentialMatches) {
        if (match.index >= currentPosition) {
            finalMatches.push(match);
            currentPosition = match.index + match.length;
        }
    }
    
    const result: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    finalMatches.forEach(match => {
        if (match.index > lastIndex) {
            result.push(content.substring(lastIndex, match.index));
        }
        result.push(
            <Link
                href={{ pathname: '/', query: { protocol: match.id } }}
                key={`${match.id}-${match.index}`}
                className="text-blue-600 hover:text-blue-800 underline"
            >
                {match.originalMatch}
            </Link>
        );
        lastIndex = match.index + match.length;
    });

    if (lastIndex < content.length) {
        result.push(content.substring(lastIndex));
    }

    return result.length > 0 ? result : [content];
};

function ProtocolNavigatorPageContent() {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Protocol[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isChatMode, setIsChatMode] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null);

  const { messages, input, handleInputChange: handleChatInputChange, handleSubmit, isLoading: isChatLoading, error: chatError } = useChat({
    api: "/api/chat",
  });

  const applyFiltersAndSearch = useCallback(() => {
    const protocolIdFromQuery = searchParams.get('protocol');
    if (protocolIdFromQuery && !searchTerm && activeFilters.length === 0) return; 

    let filteredByCategories = protocolsList;
    if (activeFilters.length > 0) {
        filteredByCategories = protocolsList.filter(protocol => 
            activeFilters.every(filter => protocol.categories?.includes(filter))
        );
    }
    if (!searchTerm.trim()) {
      setSearchResults(filteredByCategories);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const fuseInstance = new Fuse(filteredByCategories, fuseOptions);
    const results = fuseInstance.search(searchTerm);
    const finalResults = results.map(result => result.item);
    setSearchResults(finalResults);
    setIsSearching(false);
  }, [searchTerm, activeFilters, searchParams]);

  useEffect(() => {
    const protocolIdFromQuery = searchParams.get('protocol');
    if (protocolIdFromQuery) {
        const foundProtocol = protocolsList.find(p => p.id === protocolIdFromQuery);
        if (foundProtocol) {
            setSelectedProtocol(foundProtocol);
            setIsChatMode(false);
            setSearchResults([]); 
            setSearchTerm(""); 
            setActiveFilters([]);
        } else {
            setSelectedProtocol(null);
            router.push('/');
        }
    } else {
        setSelectedProtocol(null);
        applyFiltersAndSearch();
    }
  }, [searchParams, router, applyFiltersAndSearch]);

  const handleSearchTermChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    if (selectedProtocol) {
        router.push('/'); // Clear selected protocol and query params if user starts typing
        setSelectedProtocol(null); // Ensure UI updates immediately
    }
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") { 
        // applyFiltersAndSearch is called by useEffect when searchTerm changes
    }
  };

  const toggleFilter = (filterId: string) => {
    setActiveFilters(prevFilters => 
        prevFilters.includes(filterId) 
            ? prevFilters.filter(id => id !== filterId) 
            : [...prevFilters, filterId]
    );
    if (selectedProtocol) {
        router.push('/'); 
        setSelectedProtocol(null);
    }
  };

  const clearAllFilters = () => {
    setActiveFilters([]);
    if (selectedProtocol) {
        router.push('/');
        setSelectedProtocol(null);
    }
  };

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-100 p-4 md:p-8 font-sans">
      <Card className="w-full max-w-4xl shadow-xl rounded-lg overflow-hidden">
        <CardHeader className="text-center bg-gray-800 text-white p-6">
            <div className="flex justify-between items-center">
                <div className="w-10 h-10"></div> 
                <CardTitle className="text-3xl md:text-4xl font-bold">EMS Protocol Navigator</CardTitle>
                <Button variant="outline" size="icon" onClick={() => setIsCalculatorOpen(true)} title="Open Medication Calculator" className="bg-gray-700 hover:bg-gray-600 border-gray-600 text-white">
                    <CalculatorIcon className="h-5 w-5" />
                </Button>
            </div>
            <CardDescription className="text-gray-300 mt-1">Search protocols or use AI chat for assistance</CardDescription>
        </CardHeader>
        <CardContent className="p-6 bg-white">
            <div className="w-full flex items-center space-x-2 mb-4">
                <Input
                type="text"
                placeholder="Search protocols (e.g., cardiac arrest)..."
                value={searchTerm}
                onChange={handleSearchTermChange}
                onKeyDown={handleSearchKeyDown}
                className="flex-grow border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md shadow-sm text-gray-900"
                />
                <Button variant="outline" onClick={() => { setIsChatMode(!isChatMode); if (selectedProtocol) {router.push('/'); setSelectedProtocol(null);}}} title={isChatMode ? "Switch to Search View" : "Switch to AI Chat"} className="border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md">
                {isChatMode ? <Search className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />} <span className="ml-2 hidden sm:inline">{isChatMode ? "Search View" : "AI Chat"}</span>
                </Button>
            </div>

            {!isChatMode && !selectedProtocol && (
                <div className="mb-6 p-4 bg-gray-50 rounded-md border border-gray-200">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-gray-700 mr-2"><Filter className="h-4 w-4 inline-block mr-1 mb-px"/>Filters:</span>
                        {CATEGORY_FILTERS.map(filter => (
                            <Button 
                                key={filter.id} 
                                variant={activeFilters.includes(filter.id) ? "default" : "outline"}
                                size="sm"
                                onClick={() => toggleFilter(filter.id)}
                                className={`rounded-full text-xs px-3 py-1 ${activeFilters.includes(filter.id) ? 'bg-blue-600 text-white hover:bg-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
                            >
                                {filter.label}
                            </Button>
                        ))}
                        {activeFilters.length > 0 && (
                            <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-xs text-red-500 hover:bg-red-50 rounded-full px-3 py-1">
                                <XCircle className="h-3 w-3 mr-1"/> Clear All
                            </Button>
                        )}
                    </div>
                </div>
            )}

            <div className="w-full h-[60vh] flex flex-col">
                {isChatMode ? (
                <div className="h-full flex flex-col border border-gray-300 rounded-md shadow-inner">
                    <ScrollArea className="flex-grow p-4 bg-white" ref={chatContainerRef}>
                        {messages.map((msg) => (
                        <div key={msg.id} className={`mb-3 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div className={`p-3 rounded-lg shadow-md max-w-[80%] ${msg.role === "user" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"}`}>
                                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            </div>
                        </div>
                        ))}
                        {chatError && (
                             <div className="flex justify-start mb-3">
                                <div className="bg-red-100 text-red-700 p-3 rounded-lg shadow-md inline-flex items-center max-w-[80%]">
                                    <AlertCircle className="inline-block h-4 w-4 mr-2 flex-shrink-0"/>
                                    <p className="text-sm whitespace-pre-wrap">Sorry, an error occurred: {chatError.message}</p>
                                </div>
                            </div>
                        )}
                        {isChatLoading && messages[messages.length -1]?.role === 'user' && (
                            <div className="flex justify-start mb-3">
                                <div className="bg-gray-200 text-gray-700 p-3 rounded-lg shadow-md inline-flex items-center">
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Thinking...
                                </div>
                            </div>
                        )}
                    </ScrollArea>
                    <form onSubmit={handleSubmit} className="flex items-center space-x-2 p-3 border-t border-gray-200 bg-gray-50 rounded-b-md">
                        <Input
                        placeholder="Ask the AI about protocols..."
                        value={input}
                        onChange={handleChatInputChange}
                        disabled={isChatLoading}
                        className="flex-grow border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md shadow-sm text-gray-900"
                        />
                        <Button type="submit" disabled={isChatLoading || !input.trim()} className="bg-blue-600 hover:bg-blue-700 text-white rounded-md">
                        {isChatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
                        </Button>
                    </form>
                </div>
                ) : selectedProtocol ? (
                    <ScrollArea className="h-full border border-gray-300 rounded-md p-4 bg-gray-50 shadow-inner">
                        <Button onClick={() => {router.push('/'); setSelectedProtocol(null);}} className="mb-4 bg-blue-600 hover:bg-blue-700 text-white">Back to Search Results</Button>
                        <Card key={selectedProtocol.id} className="shadow-md rounded-lg overflow-hidden">
                            <CardHeader className="bg-gray-100 p-4 border-b border-gray-200">
                                <CardTitle className="text-xl font-semibold text-blue-700">{selectedProtocol.name} <span className="text-sm text-gray-500 font-mono">({selectedProtocol.id})</span></CardTitle>
                                <CardDescription className="text-xs text-gray-500">Source: {selectedProtocol.source_file}</CardDescription>
                                {selectedProtocol.categories && selectedProtocol.categories.length > 0 && (
                                    <div className="mt-2">
                                        {selectedProtocol.categories.map(cat => (
                                            <span key={cat} className="inline-block bg-blue-100 text-blue-800 text-xs font-medium mr-2 px-2.5 py-0.5 rounded-full">{cat}</span>
                                        ))}
                                    </div>
                                )}
                            </CardHeader>
                            <CardContent className="p-4 bg-white">
                                <div className="whitespace-pre-wrap text-sm font-mono bg-gray-50 text-gray-800 p-3 rounded-md overflow-x-auto border border-gray-200 min-h-[50px]">
                                    {linkifyContent(selectedProtocol.content, protocolsList, selectedProtocol.id)}
                                </div>
                            </CardContent>
                        </Card>
                    </ScrollArea>
                ) : (
                <ScrollArea className="h-full border border-gray-300 rounded-md p-4 bg-gray-50 shadow-inner">
                    {isSearching && (
                        <div className="flex justify-center items-center h-full">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                            <p className="ml-2 text-gray-600">Searching...</p>
                        </div>
                    )}
                    {!isSearching && searchResults.length > 0 ? (
                    <div className="space-y-4">
                        {searchResults.map((protocol) => (
                                <Card key={protocol.id} className="shadow-md hover:shadow-lg transition-shadow duration-200 rounded-lg overflow-hidden">
                                    <CardHeader className="bg-gray-100 p-4 border-b border-gray-200">
                                    <CardTitle className="text-lg font-semibold text-blue-700">
                                        <Link href={{ pathname: '/', query: { protocol: protocol.id } }} className="hover:underline">
                                            {protocol.name}
                                        </Link> <span className="text-xs text-gray-500 font-mono">({protocol.id})</span>
                                    </CardTitle>
                                    <CardDescription className="text-xs text-gray-500">Source: {protocol.source_file}</CardDescription>
                                    {protocol.categories && protocol.categories.length > 0 && (
                                        <div className="mt-1">
                                            {protocol.categories.map(cat => (
                                                <span key={cat} className="inline-block bg-blue-100 text-blue-800 text-xs font-medium mr-2 px-2 py-0.5 rounded-full">{cat}</span>
                                            ))}
                                        </div>
                                    )}
                                    </CardHeader>
                                    <CardContent className="p-4 bg-white">
                                    <div className="whitespace-pre-wrap text-sm font-mono bg-gray-50 text-gray-800 p-3 rounded-md overflow-x-auto border border-gray-200 min-h-[50px]">
                                        {linkifyContent(protocol.content, protocolsList, protocol.id)}
                                    </div>
                                    </CardContent>
                                </Card>
                            ))}
                    </div>
                    ) : (
                    !isSearching && (
                        <div className="text-center text-gray-500 pt-16">
                            <Search className="h-12 w-12 mx-auto text-gray-400 mb-2"/>
                            {(searchTerm || activeFilters.length > 0) ? "No protocols found matching your criteria." : "Enter a search term or select filters to begin."}
                        </div>
                    )
                    )}
                </ScrollArea>
                )}
            </div>
        </CardContent>
      </Card>
      <MedicationCalculator isOpen={isCalculatorOpen} onClose={() => setIsCalculatorOpen(false)} />
      <footer className="mt-8 text-center text-xs text-gray-500">
        <p>EMS Protocol Navigator & AI Assistant</p>
      </footer>
    </div>
  );
}

export default function HomePage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-screen text-xl text-gray-700"><Loader2 className="h-8 w-8 animate-spin mr-3" />Loading protocols...</div>}> 
            <ProtocolNavigatorPageContent />
        </Suspense>
    );
}


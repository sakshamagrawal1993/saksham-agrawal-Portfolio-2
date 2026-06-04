import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface ProjectMetadata {
  id: string;
  slide_deck_url: string | null;
  image_url: string | null;
}

export const useProjectMetadata = () => {
  const [metadata, setMetadata] = useState<Record<string, ProjectMetadata>>({});

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const { data, error } = await supabase.from('portfolio_projects').select('*');
        if (error) {
          console.error('Error fetching project metadata:', error);
          return;
        }

        if (data) {
          const map = data.reduce((acc: Record<string, ProjectMetadata>, item) => {
            acc[item.id] = item;
            return acc;
          }, {});
          setMetadata(map);
        }
      } catch (err) {
        console.error('Unexpected error fetching metadata:', err);
      }
    };
    fetchMetadata();
  }, []);

  return metadata;
};

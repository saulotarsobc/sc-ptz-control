import {
  Badge,
  Card,
  Container,
  Group,
  SimpleGrid,
  Text,
  Title,
} from "@mantine/core";
import { IconDownload, IconHeart, IconPhoto } from "@tabler/icons-react";

const mockImages = [
  { id: 1, title: "Nature Landscape", size: "2.4 MB", downloads: 1234 },
  { id: 2, title: "City Skyline", size: "1.8 MB", downloads: 856 },
  { id: 3, title: "Abstract Art", size: "3.1 MB", downloads: 2341 },
  { id: 4, title: "Ocean View", size: "2.7 MB", downloads: 1678 },
  { id: 5, title: "Mountain Peak", size: "4.2 MB", downloads: 945 },
  { id: 6, title: "Forest Path", size: "2.9 MB", downloads: 1567 },
];

export function GalleryPage() {
  return (
    <Container size="lg" py="xl">
      <Group mb="xl">
        <IconPhoto size={32} />
        <Title order={1}>Gallery</Title>
      </Group>

      <Text size="lg" c="dimmed" mb="xl">
        Explore our collection of beautiful images and photos.
      </Text>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
        {mockImages.map((image) => (
          <Card key={image.id} shadow="sm" padding="lg" radius="md" withBorder>
            <Card.Section
              style={{
                height: 200,
                background: `linear-gradient(45deg, var(--mantine-color-blue-6), var(--mantine-color-cyan-6))`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconPhoto size={64} color="white" opacity={0.7} />
            </Card.Section>

            <Group justify="space-between" mt="md" mb="xs">
              <Text fw={500}>{image.title}</Text>
              <Badge color="blue" variant="light">
                {image.size}
              </Badge>
            </Group>

            <Group justify="space-between">
              <Group gap="xs">
                <IconDownload size={16} />
                <Text size="sm" c="dimmed">
                  {image.downloads} downloads
                </Text>
              </Group>
              <IconHeart size={16} color="var(--mantine-color-red-6)" />
            </Group>
          </Card>
        ))}
      </SimpleGrid>
    </Container>
  );
}

import { Box, Switch, useMantineColorScheme } from "@mantine/core";
import { IconMoon, IconSun } from "@tabler/icons-react";
import classes from "./ColorSchemeToggle.module.css";

/**
 * A custom theme switch component using Mantine.
 *
 * @param {object} props - The props for the CustomThemeSwitch component.
 * @param {boolean} props.checked - The checked state of the switch (true = dark mode).
 * @param {function} props.onChange - The function to handle the change event.
 * @returns {JSX.Element} - JSX.Element
 */
export function CustomThemeSwitch({
  checked,
  onChange = () => null,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Box className={classes.switchContainer}>
      {/* Moon icon for dark mode */}
      <Box
        className={classes.moonIcon}
        data-visible={checked}
        onClick={() => onChange(!checked)}
      >
        <IconMoon size={18} color="white" />
      </Box>

      {/* Main switch */}
      <Switch
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className={classes.switch}
        styles={{
          track: {
            cursor: "pointer",
          },
        }}
      />

      {/* Sun icon for light mode */}
      <Box
        className={classes.sunIcon}
        data-visible={!checked}
        onClick={() => onChange(!checked)}
      >
        <IconSun size={16} color="white" />
      </Box>
    </Box>
  );
}

/**
 * ColorSchemeToggle component that integrates with Mantine's color scheme
 */
export function ColorSchemeToggle() {
  const { setColorScheme, colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <CustomThemeSwitch
      checked={isDark}
      onChange={(value) => setColorScheme(value ? "dark" : "light")}
    />
  );
}

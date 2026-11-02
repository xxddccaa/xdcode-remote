import * as React from 'react';
import { Image, Linking, Platform, Text, View } from 'react-native';
import { usePrivateSite } from '@/auth/privateSite';

export function RegistrationFooter() {
    const { site } = usePrivateSite();
    if (!site || (!site.icpNumber && !site.policeNumber)) return null;
    const settings = site;
    const text = { color: '#737373', fontSize: 11, lineHeight: 20 };
    const link = (url: string, label: string) => Platform.OS === 'web'
        ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{label}</a>
        : <Text accessibilityRole="link" onPress={() => void Linking.openURL(url)}>{label}</Text>;
    return <View style={{ alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fafafa' }}>
        {!!settings.icpNumber && <Text style={text}>ICP 编号: {link(settings.icpUrl, settings.icpNumber)}</Text>}
        {!!settings.policeNumber && <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Text style={text}>公安备案: </Text>
            <Image source={require('@/assets/images/public-security.webp')} accessibilityLabel="公安备案 logo" style={{ width: 20, height: 20, marginHorizontal: 4 }} />
            <Text style={text}>{link(settings.policeUrl, settings.policeNumber)}</Text>
        </View>}
    </View>;
}
